import type { Readable } from 'stream';
import { createHmac, timingSafeEqual } from 'crypto';

import {
  Injectable,
  NotFoundException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import {
  buildAttachmentPreview,
  canPreviewWithoutServer,
  needsServerPreview,
  type AttachmentPreviewResult,
} from '../attachment/attachment-preview.util';
import { ProjectAccessService } from '../project/project-access.service';

import { UploadFileDto } from './dto/upload-file.dto';
import { FileStorageService } from './file-storage.service';

interface FileListItem {
  id: string;
  projectId: string;
  archiveItemId: string | null;
  fileName: string;
  originalName: string;
  fileExt: string;
  fileSize: bigint;
  mimeType: string;
  storagePath: string;
  versionNo: string;
  isCurrent: boolean;
  fileStatus: string;
  uploadUserId: string;
  uploadTime: Date;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
  uploadUser: {
    id: string;
    realName: string;
  };
}

interface FilePreviewTokenPayload {
  fileId: string;
  userId: string;
  expiresAt: number;
}

const MAX_SERVER_PREVIEW_BYTES = 25 * 1024 * 1024;
const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
    private readonly projectAccess: ProjectAccessService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Upload a file: save to storage, create DB record, set to current version.
   * Updates related archive item status to Uploaded.
   */
  async upload(
    file: Express.Multer.File,
    dto: UploadFileDto,
    userId: string,
  ): Promise<FileListItem> {
    const { projectId, archiveItemId, remark } = dto;

    // Verify project exists
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    await this.projectAccess.assertProjectAccess(projectId, userId);

    let archiveItem:
      | {
          id: string;
          needReview: boolean;
          responsibleUserId: string | null;
          reviewUserId: string | null;
        }
      | null = null;

    // Verify archive item if provided
    if (archiveItemId) {
      archiveItem = await this.prisma.projectArchiveItem.findFirst({
        where: { id: archiveItemId, projectId },
        select: {
          id: true,
          needReview: true,
          responsibleUserId: true,
          reviewUserId: true,
        },
      });
      if (!archiveItem) {
        throw new NotFoundException('档案目录项不存在');
      }
    }

    // Generate version number
    const versionNo = await this.generateVersionNo(projectId, archiveItemId);

    // Save file to storage
    const subPath = `projects/${projectId}`;
    const storagePath = await this.fileStorage.upload(file, subPath);

    // Extract file extension
    const fileExt = this.getFileExtension(file.originalname);

    // Create DB record within transaction so all writes are atomic
    const dbFile = await this.prisma.$transaction(async (tx) => {
      const reviewUserId = archiveItem?.reviewUserId ?? archiveItem?.responsibleUserId ?? null;
      const shouldCreateReview = Boolean(archiveItemId && reviewUserId);
      const initialFileStatus = shouldCreateReview ? 'Reviewing' : 'Uploaded';

      // If linked to archive item, deprecate previous current versions first
      if (archiveItemId) {
        await tx.file.updateMany({
          where: {
            projectId,
            archiveItemId,
            isCurrent: true,
            deletedAt: null,
          },
          data: { isCurrent: false },
        });
      }

      const created = await tx.file.create({
        data: {
          projectId,
          archiveItemId: archiveItemId || null,
          fileName: file.originalname,
          originalName: file.originalname,
          fileExt,
          fileSize: BigInt(file.size),
          mimeType: file.mimetype,
          storageProvider: 'minio',
          storageBucket: this.fileStorage.getBucketName(),
          storagePath,
          versionNo,
          isCurrent: true,
          fileStatus: initialFileStatus,
          uploadUserId: userId,
          remark: remark || null,
        },
        select: {
          id: true,
          projectId: true,
          archiveItemId: true,
          fileName: true,
          originalName: true,
          fileExt: true,
          fileSize: true,
          mimeType: true,
          storagePath: true,
          versionNo: true,
          isCurrent: true,
          fileStatus: true,
          uploadUserId: true,
          uploadTime: true,
          remark: true,
          createdAt: true,
          updatedAt: true,
          uploadUser: {
            select: { id: true, realName: true },
          },
        },
      });

      // Update archive item status to Uploaded
      if (archiveItemId) {
        await tx.projectArchiveItem.update({
          where: { id: archiveItemId },
          data: { status: initialFileStatus },
        });
      }

      if (archiveItemId && reviewUserId && shouldCreateReview) {
        await tx.fileReview.create({
          data: {
            fileId: created.id,
            archiveItemId,
            reviewUserId,
            reviewStatus: 'Pending',
            reviewComment: '文件上传后自动提交审核',
          },
        });
      }

      return created;
    });

    this.logger.log(`File uploaded: ${dbFile.fileName} (${dbFile.id})`);
    return dbFile;
  }

  /**
   * Find file by ID.
   */
  async findById(id: string, userId?: string): Promise<FileListItem> {
    const file = await this.prisma.file.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        projectId: true,
        archiveItemId: true,
        fileName: true,
        originalName: true,
        fileExt: true,
        fileSize: true,
        mimeType: true,
        storagePath: true,
        versionNo: true,
        isCurrent: true,
        fileStatus: true,
        uploadUserId: true,
        uploadTime: true,
        remark: true,
        createdAt: true,
        updatedAt: true,
        uploadUser: {
          select: { id: true, realName: true },
        },
      },
    });

    if (!file) {
      throw new NotFoundException('文件不存在');
    }
    if (userId) {
      await this.projectAccess.assertProjectAccess(file.projectId, userId);
    }

    return file;
  }

  /**
   * Get all files for an archive item.
   */
  async findByArchiveItem(
    archiveItemId: string,
    userId: string,
  ): Promise<FileListItem[]> {
    const archiveItem = await this.prisma.projectArchiveItem.findUnique({
      where: { id: archiveItemId },
      select: { projectId: true },
    });
    if (!archiveItem) {
      throw new NotFoundException('档案目录项不存在');
    }
    await this.projectAccess.assertProjectAccess(archiveItem.projectId, userId);

    const files = await this.prisma.file.findMany({
      where: { archiveItemId, deletedAt: null },
      select: {
        id: true,
        projectId: true,
        archiveItemId: true,
        fileName: true,
        originalName: true,
        fileExt: true,
        fileSize: true,
        mimeType: true,
        storagePath: true,
        versionNo: true,
        isCurrent: true,
        fileStatus: true,
        uploadUserId: true,
        uploadTime: true,
        remark: true,
        createdAt: true,
        updatedAt: true,
        uploadUser: {
          select: { id: true, realName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return files;
  }

  /**
   * Get all files for a project.
   */
  async findByProject(
    projectId: string,
    userId: string,
  ): Promise<FileListItem[]> {
    await this.projectAccess.assertProjectAccess(projectId, userId);
    const files = await this.prisma.file.findMany({
      where: { projectId, deletedAt: null },
      select: {
        id: true,
        projectId: true,
        archiveItemId: true,
        fileName: true,
        originalName: true,
        fileExt: true,
        fileSize: true,
        mimeType: true,
        storagePath: true,
        versionNo: true,
        isCurrent: true,
        fileStatus: true,
        uploadUserId: true,
        uploadTime: true,
        remark: true,
        createdAt: true,
        updatedAt: true,
        uploadUser: {
          select: { id: true, realName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return files;
  }

  /**
   * Prepare download: returns presigned URL or local URL.
   * Logs sensitive operation.
   */
  async download(
    fileId: string,
    userId: string,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string }> {
    const fileRecord = await this.findById(fileId);

    // Data scope authorization
    await this.checkProjectAccess(fileRecord.projectId, userId);

    const stream = await this.fileStorage.getObject(fileRecord.storagePath);

    // Log operation (sensitive action)
    await this.prisma.operationLog.create({
      data: {
        userId,
        module: 'file',
        action: 'download',
        targetType: 'file',
        targetId: fileId,
        result: 'success',
      },
    });

    return {
      stream,
      fileName: fileRecord.originalName,
      mimeType: fileRecord.mimeType,
    };
  }

  async createPreviewLink(
    fileId: string,
    userId: string,
  ): Promise<{ token: string; expiresAt: string }> {
    await this.findById(fileId, userId);
    const expiresAt = new Date(Date.now() + PREVIEW_TOKEN_TTL_MS);
    return {
      token: this.signPreviewToken({
        fileId,
        userId,
        expiresAt: expiresAt.getTime(),
      }),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async getSignedPreviewPage(
    fileId: string,
    token: string | undefined,
    contentUrl: string,
  ): Promise<string> {
    const payload = this.verifyPreviewToken(fileId, token);
    const fileRecord = await this.findById(fileId, payload.userId);
    const preview = await this.buildPreviewForFile(fileRecord);
    await this.prisma.operationLog.create({
      data: {
        userId: payload.userId,
        module: 'file',
        action: 'preview',
        targetType: 'file',
        targetId: fileId,
        result: 'success',
      },
    });
    return this.renderPreviewPage(preview, contentUrl);
  }

  async getSignedContent(
    fileId: string,
    token: string | undefined,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string }> {
    const payload = this.verifyPreviewToken(fileId, token);
    const fileRecord = await this.findById(fileId, payload.userId);
    const stream = await this.fileStorage.getObject(fileRecord.storagePath);
    return {
      stream,
      fileName: fileRecord.originalName,
      mimeType: fileRecord.mimeType,
    };
  }

  /**
   * Soft delete a file.
   */
  async softDelete(fileId: string, userId: string): Promise<void> {
    const file = await this.findById(fileId);

    // Data scope authorization
    await this.checkProjectAccess(file.projectId, userId);

    await this.prisma.file.update({
      where: { id: fileId },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`File soft-deleted: ${fileId}`);
  }

  /**
   * Set a file as the current version, deprecating any previous current.
   */
  async setCurrentVersion(fileId: string, userId: string): Promise<FileListItem> {
    const file = await this.findById(fileId);

    // Data scope authorization
    await this.checkProjectAccess(file.projectId, userId);

    // Deprecate all current files for same project+archiveItem
    await this.prisma.file.updateMany({
      where: {
        projectId: file.projectId,
        archiveItemId: file.archiveItemId,
        isCurrent: true,
        deletedAt: null,
      },
      data: { isCurrent: false },
    });

    // Set this file as current
    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: { isCurrent: true },
      select: {
        id: true,
        projectId: true,
        archiveItemId: true,
        fileName: true,
        originalName: true,
        fileExt: true,
        fileSize: true,
        mimeType: true,
        storagePath: true,
        versionNo: true,
        isCurrent: true,
        fileStatus: true,
        uploadUserId: true,
        uploadTime: true,
        remark: true,
        createdAt: true,
        updatedAt: true,
        uploadUser: {
          select: { id: true, realName: true },
        },
      },
    });

    this.logger.log(`File set as current version: ${fileId}`);
    return updated;
  }

  /**
   * Generate a version number: count existing files for the same (project, archiveItem).
   * Format: V{major}.{minor}
   */
  async generateVersionNo(
    projectId: string,
    archiveItemId?: string | null,
  ): Promise<string> {
    const where: Prisma.FileWhereInput = { projectId, deletedAt: null };
    if (archiveItemId) {
      where.archiveItemId = archiveItemId;
    }

    const count = await this.prisma.file.count({ where });

    if (count === 0) {
      return 'V1.0';
    }

    const major = Math.floor(count / 10) + 1;
    const minor = count % 10;
    return `V${major}.${minor}`;
  }

  /**
   * Helper: extract file extension from original name.
   */
  private getFileExtension(originalName: string): string {
    const dotIndex = originalName.lastIndexOf('.');
    if (dotIndex === -1) {
      return '';
    }
    return originalName.substring(dotIndex + 1).toLowerCase();
  }

  private async buildPreviewForFile(file: FileListItem): Promise<AttachmentPreviewResult> {
    const fileExt = file.fileExt.toLowerCase();
    const base = {
      fileName: file.originalName,
      fileExt,
      mimeType: file.mimeType,
    };

    if (fileExt === 'pdf' && file.fileSize <= BigInt(MAX_SERVER_PREVIEW_BYTES)) {
      const stream = await this.fileStorage.getObject(file.storagePath);
      const buffer = await this.streamToBuffer(stream);
      return buildAttachmentPreview({ ...base, buffer });
    }
    if (canPreviewWithoutServer(fileExt, file.mimeType)) {
      return buildAttachmentPreview(base);
    }
    if (!needsServerPreview(fileExt)) {
      return buildAttachmentPreview(base);
    }
    if (file.fileSize > BigInt(MAX_SERVER_PREVIEW_BYTES)) {
      return {
        ...base,
        title: file.originalName,
        previewKind: 'unsupported',
        viewer: 'download',
        reason: '文件超过 25MB，在线预览已限制，请下载查看。',
      };
    }

    const stream = await this.fileStorage.getObject(file.storagePath);
    const buffer = await this.streamToBuffer(stream);
    return buildAttachmentPreview({ ...base, buffer });
  }

  private signPreviewToken(payload: FilePreviewTokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64url',
    );
    const signature = createHmac('sha256', this.getPreviewSecret())
      .update(body)
      .digest('base64url');
    return `${body}.${signature}`;
  }

  private verifyPreviewToken(
    fileId: string,
    token?: string,
  ): FilePreviewTokenPayload {
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

    let payload: FilePreviewTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as FilePreviewTokenPayload;
    } catch {
      throw new ForbiddenException('预览链接无效或已过期');
    }

    if (
      payload.fileId !== fileId ||
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

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private renderPreviewPage(
    preview: AttachmentPreviewResult,
    contentUrl: string,
  ): string {
    const title = escapeHtml(preview.title || preview.fileName);
    const safeContentUrl = escapeHtml(contentUrl);
    const body =
      preview.previewKind === 'image'
        ? `<img class="preview-image" src="${safeContentUrl}" alt="${title}" />`
        : preview.previewKind === 'pdf'
          ? `<main class="pdf-reader">
              <section class="pdf-native-panel">
                <iframe class="preview-frame" src="${safeContentUrl}#toolbar=1&navpanes=0&view=FitH" title="${title}"></iframe>
              </section>
              <section class="pdf-text-panel">
                ${preview.html || '<section class="preview-empty"><h2>PDF 预览</h2><p>当前浏览器未返回可见文本层，请下载原文件查看。</p></section>'}
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
    body { margin: 0; color: #1d2129; background: #f2f4f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
    .preview-page { min-height: 100%; display: flex; flex-direction: column; }
    .preview-header { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 10px; min-height: 54px; padding: 10px 18px; border-bottom: 1px solid #e5e6eb; background: rgba(255,255,255,.96); backdrop-filter: blur(8px); }
    .preview-header h1 { min-width: 0; margin: 0; overflow: hidden; font-size: 15px; font-weight: 650; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
    .preview-header span { flex: 0 0 auto; color: #86909c; font-size: 12px; text-transform: uppercase; }
    .preview-content { flex: 1; min-height: 0; padding: 16px; overflow: auto; }
    .preview-image { display: block; max-width: 100%; max-height: calc(100vh - 92px); margin: 0 auto; object-fit: contain; background: #fff; border: 1px solid #e5e6eb; }
    .preview-frame { width: 100%; height: 100%; border: 0; background: #fff; }
    .pdf-reader { display: grid; gap: 12px; min-height: calc(100vh - 92px); }
    .pdf-native-panel { height: calc(100vh - 92px); min-height: 620px; border: 1px solid #d9dfe8; background: #fff; }
    .pdf-text-panel { max-height: 360px; overflow: auto; padding: 18px; border: 1px solid #d9dfe8; background: #fff; }
    .pdf-page-fallback, .word-page { border: 1px solid #d9dfe8; background: #fff; }
    .pdf-page-fallback { min-height: 100%; padding: 26px 30px; }
    .pdf-page-label, .word-page-meta { margin-bottom: 18px; color: #86909c; font-size: 12px; }
    .preview-document, .preview-text, .preview-empty { width: min(1240px, 100%); min-height: calc(100vh - 92px); margin: 0 auto; }
    .office-word { display: flex; justify-content: center; padding: 18px 0 32px; }
    .word-page { width: min(900px, 100%); min-height: 1120px; padding: 72px 82px; box-shadow: 0 16px 42px rgba(15, 23, 42, 0.12); }
    .word-body h1 { margin: 0 0 28px; font-size: 26px; font-weight: 700; line-height: 1.35; text-align: center; }
    .word-body p { margin: 0 0 12px; font-size: 15px; line-height: 1.9; text-indent: 2em; white-space: pre-wrap; }
    .office-excel { min-height: calc(100vh - 92px); border: 1px solid #d9dfe8; background: #f7f9fc; }
    .office-excel > header { display: none; }
    .preview-sheet { margin: 0; padding: 0 0 38px; background: #fff; }
    .preview-sheet h3 { position: sticky; top: 0; z-index: 1; margin: 0; padding: 10px 14px; border-bottom: 1px solid #d9dfe8; background: #f2f5f9; font-size: 13px; font-weight: 650; }
    .preview-table-wrap { width: 100%; overflow: auto; background: #fff; }
    .preview-document table { width: 100%; border-collapse: collapse; table-layout: auto; font-size: 13px; background: #fff; }
    .preview-document td, .preview-document th { min-width: 112px; padding: 7px 9px; border: 1px solid #d9dfe8; vertical-align: top; word-break: break-word; }
    .preview-document tr:first-child td, .preview-document tr:first-child th { position: sticky; top: 34px; z-index: 1; background: #edf3ff; font-weight: 650; }
    .office-presentation { display: grid; gap: 16px; }
    .preview-slide { aspect-ratio: 16 / 9; max-width: 960px; margin: 0 auto 18px; padding: 48px 56px; border: 1px solid #d9dfe8; background: #fff; box-shadow: 0 16px 36px rgba(15, 23, 42, 0.12); }
    .preview-document h2, .preview-document h3 { margin: 0 0 14px; line-height: 1.35; }
    .preview-document p { margin: 0 0 10px; color: #4e5969; line-height: 1.75; white-space: pre-wrap; }
    .preview-text { padding: 24px 28px; border: 1px solid #e5e6eb; background: #fff; overflow: auto; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }
    .preview-empty { display: grid; place-content: center; padding: 24px 28px; border: 1px solid #e5e6eb; background: #fff; text-align: center; color: #4e5969; }
    @media (max-width: 960px) { .pdf-native-panel { min-height: 520px; } .word-page { min-height: auto; padding: 40px 28px; } }
  </style>
</head>
<body>
  <div class="preview-page">
    <header class="preview-header"><h1>${title}</h1><span>${escapeHtml(preview.fileExt || '')}</span></header>
    <section class="preview-content">${body}</section>
  </div>
</body>
</html>`;
  }

  /**
   * Check if a user has access to a project through its project.
   * Elevated roles (SUPER_ADMIN, SYSTEM_ADMIN, DELIVERY_MANAGER) bypass the check.
   * Other users must be a member of the project.
   */
  private async checkProjectAccess(projectId: string, userId: string): Promise<void> {
    await this.projectAccess.assertProjectAccess(projectId, userId);
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
