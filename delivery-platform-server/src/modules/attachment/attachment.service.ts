import type { Readable } from 'stream';
import { createHmac, timingSafeEqual } from 'crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { FileStorageService } from '../file/file-storage.service';
import { withNormalizedUploadFileName } from '../file/upload-file-name.util';
import { OperationLogService } from '../operation-log/operation-log.service';
import { ProjectAccessService } from '../project/project-access.service';

import {
  buildAttachmentPreview,
  canPreviewWithoutServer,
  needsServerPreview,
  type AttachmentPreviewResult,
} from './attachment-preview.util';
import {
  AttachmentOwnerType,
  QueryAttachmentDto,
  UploadAttachmentDto,
} from './dto/attachment.dto';

interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
}

interface AttachmentRecord {
  id: string;
  ownerType: string;
  ownerId: string;
  projectId: string | null;
  originalName: string;
  fileExt: string;
  fileSize: bigint;
  mimeType: string;
  storagePath: string;
}

interface PreviewTokenPayload {
  attachmentId: string;
  userId: string;
  expiresAt: number;
}

const MAX_SERVER_PREVIEW_BYTES = 25 * 1024 * 1024;
const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly operationLog: OperationLogService,
    private readonly projectAccess: ProjectAccessService,
    private readonly configService: ConfigService,
  ) {}

  async uploadMany(
    files: Express.Multer.File[],
    dto: UploadAttachmentDto,
    userId: string,
  ) {
    if (!files.length) {
      throw new BadRequestException('请至少选择一个文件');
    }
    const ownerProjectId = await this.resolveOwnerProjectId(
      dto.ownerType,
      dto.ownerId,
    );
    if (ownerProjectId && dto.projectId && ownerProjectId !== dto.projectId) {
      throw new BadRequestException('附件关联项目与所属业务记录不一致');
    }
    const projectId = ownerProjectId ?? dto.projectId;
    if (projectId) {
      await this.projectAccess.assertProjectAccess(projectId, userId);
    } else {
      await this.assertDomainPermission(dto.ownerType, userId, 'manage');
    }
    if (dto.ownerType === 'ChecklistItem') {
      await this.validateChecklistEvidence(files, dto.ownerId, dto.captureSource);
    }

    const created = [];
    for (const file of files) {
      const uploadFile = withNormalizedUploadFileName(file);
      const storagePath = await this.storage.upload(
        uploadFile,
        `attachments/${dto.ownerType}/${dto.ownerId}`,
      );
      const fileExt = uploadFile.originalname.includes('.')
        ? uploadFile.originalname.split('.').pop()!.toLowerCase()
        : '';
      created.push(
        await this.prisma.attachment.create({
          data: {
            ownerType: dto.ownerType,
            ownerId: dto.ownerId,
            projectId,
            category: dto.category,
            fileName: uploadFile.originalname,
            originalName: uploadFile.originalname,
            fileExt,
            fileSize: BigInt(uploadFile.size),
            mimeType: uploadFile.mimetype,
            storageBucket: this.storage.getBucketName(),
            storagePath,
            uploadedBy: userId,
            capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : undefined,
            captureSource: dto.captureSource,
            latitude: dto.latitude,
            longitude: dto.longitude,
            remark: dto.remark,
          },
          include: {
            uploader: { select: { id: true, realName: true, username: true } },
          },
        }),
      );
    }

    return created;
  }

  async findAll(query: QueryAttachmentDto, userId: string) {
    const { page = 1, pageSize = 20, ownerType, ownerId, projectId, category } =
      query;
    let scopedProjectId = projectId;
    if (ownerType && ownerId) {
      const ownerProjectId = await this.resolveOwnerProjectId(ownerType, ownerId);
      if (ownerProjectId && projectId && ownerProjectId !== projectId) {
        throw new BadRequestException('附件查询项目与所属业务记录不一致');
      }
      scopedProjectId = ownerProjectId ?? projectId;
    }
    if (scopedProjectId) {
      await this.projectAccess.assertProjectAccess(scopedProjectId, userId);
    } else if (ownerType && ownerId) {
      await this.assertDomainPermission(ownerType, userId, 'view');
    }

    const where: Prisma.AttachmentWhereInput = {
      deletedAt: null,
      ownerType,
      ownerId,
      projectId: scopedProjectId,
      category,
    };
    if (
      !scopedProjectId &&
      !(ownerType && ownerId) &&
      !(await this.projectAccess.isElevated(userId))
    ) {
      where.project = { members: { some: { userId } }, deletedAt: null };
    }
    const [total, list] = await Promise.all([
      this.prisma.attachment.count({ where }),
      this.prisma.attachment.findMany({
        where,
        include: {
          uploader: { select: { id: true, realName: true, username: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      list,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getContent(
    id: string,
    userId: string,
    audit: AuditContext,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string }> {
    const attachment = await this.findById(id);
    await this.assertAttachmentAccess(attachment, userId, 'view');
    const stream = await this.storage.getObject(attachment.storagePath);
    await this.operationLog.log({
      userId,
      module: 'attachment',
      action: 'download',
      targetType: attachment.ownerType,
      targetId: id,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    return {
      stream,
      fileName: attachment.originalName,
      mimeType: attachment.mimeType,
    };
  }

  async getPreview(
    id: string,
    userId: string,
    audit: AuditContext,
  ): Promise<AttachmentPreviewResult> {
    const attachment = await this.findById(id);
    await this.assertAttachmentAccess(attachment, userId, 'view');
    const preview = await this.buildPreviewForAttachment(attachment);

    await this.logAttachmentAction(attachment, userId, 'preview', audit);

    return preview;
  }

  async createPreviewLink(
    id: string,
    userId: string,
  ): Promise<{ token: string; expiresAt: string }> {
    const attachment = await this.findById(id);
    await this.assertAttachmentAccess(attachment, userId, 'view');
    const expiresAt = new Date(Date.now() + PREVIEW_TOKEN_TTL_MS);

    return {
      token: this.signPreviewToken({
        attachmentId: id,
        userId,
        expiresAt: expiresAt.getTime(),
      }),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async getSignedPreviewPage(
    id: string,
    token: string | undefined,
    audit: AuditContext,
    contentUrl: string,
  ): Promise<string> {
    const payload = this.verifyPreviewToken(id, token);
    const attachment = await this.findById(id);
    const preview = await this.buildPreviewForAttachment(attachment);
    await this.logAttachmentAction(attachment, payload.userId, 'preview', audit);
    return this.renderPreviewPage(preview, contentUrl);
  }

  async getSignedContent(
    id: string,
    token: string | undefined,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string }> {
    this.verifyPreviewToken(id, token);
    const attachment = await this.findById(id);
    const stream = await this.storage.getObject(attachment.storagePath);
    return {
      stream,
      fileName: attachment.originalName,
      mimeType: attachment.mimeType,
    };
  }

  private async buildPreviewForAttachment(
    attachment: AttachmentRecord,
  ): Promise<AttachmentPreviewResult> {
    const fileExt = attachment.fileExt.toLowerCase();
    const base = {
      fileName: attachment.originalName,
      fileExt,
      mimeType: attachment.mimeType,
    };
    const isImage =
      attachment.mimeType.startsWith('image/') ||
      ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt);

    let preview: AttachmentPreviewResult;
    if (isImage && attachment.fileSize <= BigInt(MAX_SERVER_PREVIEW_BYTES)) {
      const stream = await this.storage.getObject(attachment.storagePath);
      const buffer = await this.streamToBuffer(stream);
      preview = await buildAttachmentPreview({ ...base, buffer });
    } else if (
      fileExt === 'pdf' &&
      attachment.fileSize <= BigInt(MAX_SERVER_PREVIEW_BYTES)
    ) {
      const stream = await this.storage.getObject(attachment.storagePath);
      const buffer = await this.streamToBuffer(stream);
      preview = await buildAttachmentPreview({ ...base, buffer });
    } else if (canPreviewWithoutServer(fileExt, attachment.mimeType)) {
      preview = await buildAttachmentPreview(base);
    } else if (!needsServerPreview(fileExt)) {
      preview = await buildAttachmentPreview(base);
    } else if (attachment.fileSize > BigInt(MAX_SERVER_PREVIEW_BYTES)) {
      preview = {
        ...base,
        title: attachment.originalName,
        previewKind: 'unsupported',
        viewer: 'download',
        reason: '文件超过 25MB，在线预览已限制，请下载查看。',
      };
    } else {
      const stream = await this.storage.getObject(attachment.storagePath);
      const buffer = await this.streamToBuffer(stream);
      preview = await buildAttachmentPreview({ ...base, buffer });
    }

    return preview;
  }

  private async logAttachmentAction(
    attachment: AttachmentRecord,
    userId: string,
    action: 'preview' | 'download',
    audit: AuditContext,
  ): Promise<void> {
    await this.operationLog.log({
      userId,
      module: 'attachment',
      action,
      targetType: attachment.ownerType,
      targetId: attachment.id,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
  }

  private signPreviewToken(payload: PreviewTokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64url',
    );
    const signature = createHmac('sha256', this.getPreviewSecret())
      .update(body)
      .digest('base64url');
    return `${body}.${signature}`;
  }

  private verifyPreviewToken(
    attachmentId: string,
    token?: string,
  ): PreviewTokenPayload {
    if (!token || !token.includes('.')) {
      throw new ForbiddenException('预览链接无效或已过期');
    }

    const [body, signature] = token.split('.', 2);
    const expected = createHmac('sha256', this.getPreviewSecret())
      .update(body)
      .digest('base64url');
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new ForbiddenException('预览链接无效或已过期');
    }

    let payload: PreviewTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as PreviewTokenPayload;
    } catch {
      throw new ForbiddenException('预览链接无效或已过期');
    }

    if (
      payload.attachmentId !== attachmentId ||
      typeof payload.userId !== 'string' ||
      typeof payload.expiresAt !== 'number' ||
      Date.now() > payload.expiresAt
    ) {
      throw new ForbiddenException('预览链接无效或已过期');
    }

    return payload;
  }

  private getPreviewSecret(): string {
    return this.configService.get<string>('auth.jwtSecret') || process.env.JWT_SECRET || '';
  }

  private renderPreviewPage(
    preview: AttachmentPreviewResult,
    contentUrl: string,
  ): string {
    const title = escapeHtml(preview.title || preview.fileName);
    const safeContentUrl = escapeAttribute(contentUrl);
    const body =
      preview.previewKind === 'image'
        ? preview.html || `<img class="preview-image" src="${safeContentUrl}" alt="${title}" />`
        : preview.previewKind === 'pdf'
          ? `<main class="pdf-reader">
              <section class="pdf-native-panel">
                <object class="preview-frame" data="${safeContentUrl}#toolbar=1&navpanes=0&view=FitH" type="application/pdf">
                  <div class="pdf-text-panel pdf-text-primary">
                    ${preview.html || `<section class="preview-empty"><h2>PDF 预览</h2><p>当前浏览器未返回可见文本层，请下载原文件查看。</p></section>`}
                  </div>
                </object>
              </section>
            </main>`
          : preview.previewKind === 'html'
            ? `<main class="preview-document">${preview.html || ''}</main>`
            : preview.previewKind === 'text'
              ? `<pre class="preview-text">${escapeHtml(preview.text || '')}</pre>`
              : `<section class="preview-empty"><h2>暂不支持在线预览</h2><p>${escapeHtml(
                  preview.reason || '请下载后查看该文件。',
                )}</p></section>`;

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      color: #1d2129;
      background: #f2f4f8;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .preview-page {
      min-height: 100%;
      display: flex;
      flex-direction: column;
    }
    .preview-header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 54px;
      padding: 10px 18px;
      border-bottom: 1px solid #e5e6eb;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(8px);
    }
    .preview-header h1 {
      min-width: 0;
      margin: 0;
      overflow: hidden;
      font-size: 15px;
      font-weight: 650;
      line-height: 1.4;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .preview-header span {
      flex: 0 0 auto;
      color: #86909c;
      font-size: 12px;
      text-transform: uppercase;
    }
    .preview-content {
      flex: 1;
      min-height: 0;
      padding: 16px;
      overflow: auto;
    }
    .preview-image {
      display: block;
      max-width: 100%;
      max-height: calc(100vh - 92px);
      margin: 0 auto;
      object-fit: contain;
      background: #fff;
      border: 1px solid #e5e6eb;
    }
    .preview-frame {
      width: 100%;
      height: 100%;
      border: 1px solid #e5e6eb;
      background: #fff;
    }
    .pdf-reader {
      display: grid;
      gap: 12px;
      min-height: calc(100vh - 92px);
    }
    .pdf-native-panel,
    .pdf-text-panel {
      min-width: 0;
      border: 1px solid #d9dfe8;
      background: #fff;
    }
    .pdf-native-panel {
      min-height: calc(100vh - 92px);
    }
    .pdf-text-panel {
      overflow: auto;
      padding: 18px;
    }
    .pdf-text-primary {
      min-height: calc(100vh - 92px);
    }
    .pdf-page-fallback {
      min-height: 100%;
      padding: 26px 30px;
      border: 1px solid #e5e6eb;
      background: linear-gradient(#fff, #fff) padding-box, linear-gradient(135deg, #e5e6eb, #f7f8fa) border-box;
    }
    .pdf-page-label,
    .word-page-meta {
      margin-bottom: 18px;
      color: #86909c;
      font-size: 12px;
      letter-spacing: 0;
    }
    .preview-document,
    .preview-text,
    .preview-empty {
      width: min(1240px, 100%);
      min-height: calc(100vh - 92px);
      margin: 0 auto;
      padding: 0;
      border: 0;
      background: transparent;
    }
    .preview-document .attachment-preview {
      max-width: none;
      min-height: calc(100vh - 92px);
    }
    .office-word {
      display: flex;
      justify-content: center;
      padding: 18px 0 32px;
    }
    .word-page {
      width: min(900px, 100%);
      min-height: 1120px;
      padding: 72px 82px;
      border: 1px solid #d9dfe8;
      background: #fff;
      box-shadow: 0 16px 42px rgba(15, 23, 42, 0.12);
    }
    .word-body h1 {
      margin: 0 0 28px;
      color: #1d2129;
      font-size: 26px;
      font-weight: 700;
      line-height: 1.35;
      text-align: center;
    }
    .word-body p {
      margin: 0 0 12px;
      color: #1d2129;
      font-size: 15px;
      line-height: 1.9;
      text-indent: 2em;
      white-space: pre-wrap;
    }
    .office-excel {
      min-height: calc(100vh - 92px);
      border: 1px solid #d9dfe8;
      background: #f7f9fc;
    }
    .excel-workbook,
    .office-excel .attachment-preview {
      min-height: calc(100vh - 92px);
    }
    .office-excel > header {
      display: none;
    }
    .preview-sheet {
      margin: 0;
      padding: 0 0 38px;
      border: 0;
      background: #fff;
    }
    .preview-sheet h3 {
      position: sticky;
      top: 0;
      z-index: 1;
      margin: 0;
      padding: 10px 14px;
      border-bottom: 1px solid #d9dfe8;
      background: #f2f5f9;
      color: #1d2129;
      font-size: 13px;
      font-weight: 650;
    }
    .preview-sheet::after {
      content: "Sheet";
      display: inline-flex;
      margin: 10px 0 0 14px;
      padding: 5px 16px;
      border: 1px solid #c9d6ea;
      border-bottom: 2px solid #165dff;
      background: #fff;
      color: #165dff;
      font-size: 12px;
    }
    .preview-table-wrap {
      width: 100%;
      max-height: 70vh;
      overflow: auto;
      resize: both;
      padding: 10px;
      background:
        linear-gradient(#f7f9fc, #f7f9fc) 0 0 / 100% 34px no-repeat,
        #fff;
    }
    .office-presentation {
      display: grid;
      gap: 16px;
    }
    .preview-slide {
      aspect-ratio: 16 / 9;
      max-width: 960px;
      margin: 0 auto 18px;
      padding: 48px 56px;
      border: 1px solid #d9dfe8;
      background: #fff;
      box-shadow: 0 16px 36px rgba(15, 23, 42, 0.12);
    }
    .preview-document h2,
    .preview-document h3 {
      margin: 0 0 14px;
      color: #1d2129;
      line-height: 1.35;
    }
    .preview-document p {
      margin: 0 0 10px;
      color: #4e5969;
      line-height: 1.75;
      white-space: pre-wrap;
    }
    .preview-document table {
      width: max-content;
      min-width: 100%;
      border-collapse: collapse;
      table-layout: auto;
      font-size: 13px;
      background: #fff;
    }
    .preview-document td,
    .preview-document th {
      min-width: 112px;
      max-width: 360px;
      height: 34px;
      padding: 7px 9px;
      border: 1px solid #d9dfe8;
      vertical-align: top;
      overflow: auto;
      resize: both;
      word-break: break-word;
    }
    .preview-document tr:first-child td,
    .preview-document tr:first-child th {
      position: sticky;
      top: 34px;
      z-index: 1;
      background: #edf3ff;
      color: #1d2129;
      font-weight: 650;
    }
    .preview-text {
      padding: 24px 28px;
      border: 1px solid #e5e6eb;
      background: #fff;
      overflow: auto;
      color: #1d2129;
      line-height: 1.65;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .preview-empty {
      display: grid;
      place-content: center;
      padding: 24px 28px;
      border: 1px solid #e5e6eb;
      background: #fff;
      text-align: center;
      color: #4e5969;
    }
    @media (max-width: 960px) {
      .pdf-native-panel { min-height: 520px; }
      .word-page { min-height: auto; padding: 40px 28px; }
    }
  </style>
</head>
<body>
  <div class="preview-page">
    <header class="preview-header">
      <h1>${title}</h1>
      <span>${escapeHtml(preview.fileExt || '')}</span>
    </header>
    <section class="preview-content">
      ${body}
    </section>
  </div>
</body>
</html>`;
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const attachment = await this.findById(id);
    await this.assertAttachmentAccess(attachment, userId, 'manage');
    await this.prisma.attachment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async findById(id: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!attachment) {
      throw new NotFoundException('附件不存在');
    }
    return attachment;
  }

  private async assertAttachmentAccess(
    attachment: {
      ownerType: string;
      ownerId: string;
      projectId: string | null;
    },
    userId: string,
    action: 'view' | 'manage',
  ): Promise<void> {
    const ownerType = attachment.ownerType as AttachmentOwnerType;
    const projectId =
      attachment.projectId ??
      (await this.resolveOwnerProjectId(ownerType, attachment.ownerId));
    if (projectId) {
      await this.projectAccess.assertProjectAccess(projectId, userId);
      return;
    }
    await this.assertDomainPermission(ownerType, userId, action);
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private async resolveOwnerProjectId(
    ownerType: AttachmentOwnerType,
    ownerId: string,
  ): Promise<string | undefined> {
    switch (ownerType) {
      case 'ChecklistItem': {
        const owner = await this.prisma.projectChecklistItem.findUnique({
          where: { id: ownerId },
          select: { projectId: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return owner.projectId;
      }
      case 'Retrospective': {
        const owner = await this.prisma.projectRetrospective.findUnique({
          where: { id: ownerId },
          select: { projectId: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return owner.projectId;
      }
      case 'Report': {
        const owner = await this.prisma.dailyReport.findFirst({
          where: { id: ownerId, deletedAt: null },
          select: { projectId: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return owner.projectId;
      }
      case 'KnowledgeArticle': {
        const owner = await this.prisma.knowledgeArticle.findFirst({
          where: { id: ownerId, deletedAt: null },
          select: { id: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return undefined;
      }
      case 'KnowledgeFileRevision': {
        const owner = await this.prisma.attachment.findFirst({
          where: {
            id: ownerId,
            ownerType: 'KnowledgeArticle',
            deletedAt: null,
          },
          select: { id: true, projectId: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return owner.projectId ?? undefined;
      }
      case 'TrainingPlan': {
        const owner = await this.prisma.trainingPlan.findUnique({
          where: { id: ownerId },
          select: { id: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return undefined;
      }
      case 'ProjectProcessRecord': {
        const owner = await this.prisma.projectProcessRecord.findFirst({
          where: { id: ownerId, deletedAt: null },
          select: { projectId: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return owner.projectId;
      }
      case 'DocumentTemplate': {
        const owner = await this.prisma.documentTemplate.findUnique({
          where: { id: ownerId },
          select: { id: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return undefined;
      }
    }
  }

  private async validateChecklistEvidence(
    files: Express.Multer.File[],
    ownerId: string,
    captureSource?: string,
  ): Promise<void> {
    const item = await this.prisma.projectChecklistItem.findUnique({
      where: { id: ownerId },
      select: {
        templateItem: {
          select: {
            evidenceTypes: true,
            allowAlbum: true,
          },
        },
      },
    });
    if (!item) {
      throw new NotFoundException('附件所属业务记录不存在');
    }

    const allowedTypes = new Set(
      item.templateItem.evidenceTypes
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
    if (captureSource === 'album' && !item.templateItem.allowAlbum) {
      throw new BadRequestException('该检查项不允许从相册选择照片');
    }
    for (const file of files) {
      const evidenceType = file.mimetype.startsWith('image/')
        ? 'photo'
        : 'file';
      if (!allowedTypes.has(evidenceType)) {
        throw new BadRequestException(
          evidenceType === 'photo'
            ? '该检查项不接受照片证据'
            : '该检查项不接受文档证据',
        );
      }
    }
  }

  private async assertDomainPermission(
    ownerType: AttachmentOwnerType,
    userId: string,
    action: 'view' | 'manage',
  ): Promise<void> {
    const permissionMap: Partial<
      Record<AttachmentOwnerType, { view: string; manage: string }>
    > = {
      KnowledgeArticle: {
        view: 'knowledge:view',
        manage: 'knowledge:update',
      },
      KnowledgeFileRevision: {
        view: 'knowledge:view',
        manage: 'knowledge:update',
      },
      TrainingPlan: {
        view: 'training:view',
        manage: 'training:manage',
      },
      DocumentTemplate: {
        view: 'template:view',
        manage: 'template:update',
      },
    };
    const requiredPermission = permissionMap[ownerType]?.[action];
    if (!requiredPermission) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        userRoles: {
          select: {
            role: {
              select: {
                roleCode: true,
                rolePermissions: {
                  select: {
                    permission: {
                      select: { permissionCode: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const roles = user?.userRoles.map(({ role }) => role.roleCode) ?? [];
    if (roles.includes('SUPER_ADMIN')) {
      return;
    }
    const permissions = new Set(
      user?.userRoles.flatMap(({ role }) =>
        role.rolePermissions.map(({ permission }) => permission.permissionCode),
      ) ?? [],
    );
    if (!permissions.has(requiredPermission)) {
      throw new ForbiddenException('没有访问该业务附件的权限');
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
