import type { Readable } from 'stream';
import { createHmac, timingSafeEqual } from 'crypto';

import {
  Injectable,
  NotFoundException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type ArchiveItemStatus, type FileStatus } from '@prisma/client';

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
import { withNormalizedUploadFileName } from './upload-file-name.util';

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
    const uploadFile = withNormalizedUploadFileName(file);
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
    const reviewUserId = archiveItemId
      ? await this.resolveArchiveReviewUserId(archiveItem, userId)
      : null;

    // Generate version number
    const versionNo = await this.generateVersionNo(projectId, archiveItemId);

    // Save file to storage
    const subPath = `projects/${projectId}`;
    const storagePath = await this.fileStorage.upload(uploadFile, subPath);

    // Extract file extension
    const fileExt = this.getFileExtension(uploadFile.originalname);

    // Create DB record within transaction so all writes are atomic
    const dbFile = await this.prisma.$transaction(async (tx) => {
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
          fileName: uploadFile.originalname,
          originalName: uploadFile.originalname,
          fileExt,
          fileSize: BigInt(uploadFile.size),
          mimeType: uploadFile.mimetype,
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
          data: { status: initialFileStatus, completedAt: null },
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

  async getPreview(fileId: string, userId: string): Promise<AttachmentPreviewResult> {
    const fileRecord = await this.findById(fileId, userId);
    const preview = await this.buildPreviewForFile(fileRecord);
    await this.prisma.operationLog.create({
      data: {
        userId,
        module: 'file',
        action: 'preview',
        targetType: 'file',
        targetId: fileId,
        result: 'success',
      },
    });
    return preview;
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

    await this.prisma.$transaction(async (tx) => {
      await tx.file.update({
        where: { id: fileId },
        data: { deletedAt: new Date(), isCurrent: false },
      });

      if (!file.archiveItemId) return;

      const latestFile = await tx.file.findFirst({
        where: {
          projectId: file.projectId,
          archiveItemId: file.archiveItemId,
          deletedAt: null,
        },
        select: { id: true, fileStatus: true },
        orderBy: { createdAt: 'desc' },
      });

      await tx.projectArchiveItem.update({
        where: { id: file.archiveItemId },
        data: {
          status: this.fileStatusToArchiveStatus(latestFile?.fileStatus),
          completedAt: latestFile?.fileStatus === 'Approved' ? new Date() : null,
        },
      });

      if (latestFile) {
        await tx.file.update({
          where: { id: latestFile.id },
          data: { isCurrent: true },
        });
      }
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
    const isImage =
      file.mimeType.startsWith('image/') ||
      ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt);

    if (isImage && file.fileSize <= BigInt(MAX_SERVER_PREVIEW_BYTES)) {
      const stream = await this.fileStorage.getObject(file.storagePath);
      const buffer = await this.streamToBuffer(stream);
      return buildAttachmentPreview({ ...base, buffer });
    }
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
    const safeContentUrl = escapeAttribute(contentUrl);
    const body =
      preview.previewKind === 'image'
        ? preview.html || `<img class="preview-image" src="${safeContentUrl}" alt="${title}" />`
        : preview.previewKind === 'pdf'
          ? `<main class="pdf-reader">
              <div id="pdf-js-status" class="pdf-js-status">PDF 原文预览，支持滚动、缩放和下载。</div>
              <div id="pdf-js-pages" class="pdf-js-pages"></div>
              <object class="pdf-native-main pdf-native-fallback" data="${safeContentUrl}" type="application/pdf" aria-label="${title}">
                ${preview.html || '<section class="preview-empty"><h2>PDF 预览</h2><p>当前文件未提取到可读文本层，请下载后查看原文件。</p></section>'}
              </object>
              <script type="module">
                import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
                const pdfUrl = '${safeContentUrl}';
                const status = document.getElementById('pdf-js-status');
                const pages = document.getElementById('pdf-js-pages');
                const fallback = document.querySelector('.pdf-native-fallback');
                async function renderPdf() {
                  const pdf = await pdfjsLib.getDocument({ url: pdfUrl }).promise;
                  pages.innerHTML = '';
                  const maxPages = Math.min(pdf.numPages, 60);
                  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
                    if (status) status.textContent = '正在渲染第 ' + pageNumber + ' / ' + pdf.numPages + ' 页...';
                    const page = await pdf.getPage(pageNumber);
                    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.8);
                    const viewport = page.getViewport({ scale: pixelRatio * 1.25 });
                    const pageWrap = document.createElement('section');
                    pageWrap.className = 'pdf-rendered-page';
                    const pageLabel = document.createElement('div');
                    pageLabel.className = 'pdf-rendered-label';
                    pageLabel.textContent = '第 ' + pageNumber + ' 页';
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    canvas.style.width = Math.round(viewport.width / pixelRatio) + 'px';
                    canvas.style.height = Math.round(viewport.height / pixelRatio) + 'px';
                    pageWrap.appendChild(pageLabel);
                    pageWrap.appendChild(canvas);
                    pages.appendChild(pageWrap);
                    await page.render({ canvasContext: context, viewport }).promise;
                  }
                  if (status) status.remove();
                  if (fallback) fallback.remove();
                }
                renderPdf().catch(() => {
                  if (status) status.textContent = 'PDF.js 加载失败，已切换浏览器原生预览。';
                  if (fallback) fallback.style.display = 'block';
                });
              </script>
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
    .pdf-reader { display: grid; gap: 12px; min-height: calc(100vh - 92px); }
    .pdf-js-status { width: min(1120px, 100%); margin: 0 auto; padding: 12px 14px; border: 1px solid #d9dfe8; background: #fff; color: #4e5969; font-size: 13px; }
    .pdf-js-pages { display: grid; gap: 18px; justify-items: center; }
    .pdf-rendered-page { width: min(1120px, 100%); padding: 12px; border: 1px solid #d9dfe8; background: #fff; box-shadow: 0 16px 42px rgba(15, 23, 42, 0.08); overflow: auto; }
    .pdf-rendered-label { margin-bottom: 8px; color: #86909c; font-size: 12px; }
    .pdf-rendered-page canvas { display: block; max-width: 100%; height: auto !important; margin: 0 auto; background: #fff; }
    .pdf-native-main { width: min(1120px, 100%); height: calc(100vh - 92px); min-height: 720px; margin: 0 auto; border: 1px solid #d9dfe8; background: #fff; box-shadow: 0 16px 42px rgba(15, 23, 42, 0.08); }
    .pdf-page-fallback, .word-page { border: 1px solid #d9dfe8; background: #fff; }
    .pdf-page-fallback { min-height: calc(100vh - 92px); padding: 34px 42px; box-shadow: 0 16px 42px rgba(15, 23, 42, 0.12); }
    .pdf-page-label, .word-page-meta { margin-bottom: 18px; color: #86909c; font-size: 12px; }
    .preview-document, .preview-text, .preview-empty { width: min(1240px, 100%); min-height: calc(100vh - 92px); margin: 0 auto; }
    .attachment-preview > header { display: none; }
    .office-word { display: flex; justify-content: center; padding: 18px 0 32px; }
    .word-page { width: min(900px, 100%); min-height: 1120px; padding: 72px 82px; box-shadow: 0 16px 42px rgba(15, 23, 42, 0.12); }
    .word-body h1 { margin: 0 0 28px; font-size: 26px; font-weight: 700; line-height: 1.35; text-align: center; }
    .word-body p { margin: 0 0 12px; font-size: 15px; line-height: 1.9; text-indent: 2em; white-space: pre-wrap; }
    .office-excel { min-height: calc(100vh - 92px); border: 1px solid #d9dfe8; background: #f7f9fc; }
    .office-excel > header { display: none; }
    .excel-workbook { display: grid; gap: 18px; }
    .preview-sheet { margin: 0; padding: 0 0 38px; background: #fff; }
    .preview-sheet h3 { position: sticky; top: 0; z-index: 1; margin: 0; padding: 10px 14px; border-bottom: 1px solid #d9dfe8; background: #f2f5f9; font-size: 13px; font-weight: 650; }
    .preview-table-block { padding: 12px; }
    .preview-table-block + .preview-table-block { border-top: 1px dashed #d9dfe8; }
    .preview-table-caption { margin-bottom: 8px; color: #4e5969; font-size: 12px; font-weight: 650; }
    .preview-table-wrap { width: 100%; max-height: 70vh; overflow: auto; resize: both; padding: 10px; background: #fff; }
    .preview-document table { width: max-content; min-width: 100%; border-collapse: collapse; table-layout: auto; font-size: 13px; background: #fff; }
    .preview-document td, .preview-document th { min-width: 112px; max-width: 360px; height: 34px; padding: 7px 9px; border: 1px solid #d9dfe8; vertical-align: top; overflow: auto; resize: both; word-break: break-word; }
    .preview-document tr:first-child td, .preview-document tr:first-child th { position: sticky; top: 34px; z-index: 1; background: #edf3ff; font-weight: 650; }
    .office-presentation { display: grid; gap: 18px; justify-items: center; }
    .office-presentation { display: grid; gap: 18px; padding: 12px 0 32px; background: #eef2f7; }
    .preview-slide { position: relative; display: flex; align-items: center; justify-content: center; aspect-ratio: 16 / 9; width: min(960px, calc(100% - 32px)); margin: 0 auto 18px; padding: 58px 72px; border: 1px solid #d9dfe8; background: #fff; box-shadow: 0 16px 36px rgba(15, 23, 42, 0.12); overflow: hidden; }
    .slide-page-no { position: absolute; right: 22px; bottom: 16px; color: #86909c; font-size: 12px; }
    .slide-content { width: 100%; max-width: 760px; }
    .preview-slide h3 { margin: 0 0 26px; color: #1d2129; font-size: 30px; font-weight: 700; line-height: 1.28; text-align: center; }
    .slide-list { display: grid; gap: 14px; margin: 0; padding: 0; list-style: none; }
    .slide-list li { position: relative; padding-left: 22px; color: #4e5969; font-size: 18px; line-height: 1.62; }
    .slide-list li::before { position: absolute; top: 0.72em; left: 0; width: 7px; height: 7px; border-radius: 50%; background: #165dff; content: ''; }
    .preview-document h2, .preview-document h3 { margin: 0 0 14px; line-height: 1.35; }
    .preview-document p { margin: 0 0 10px; color: #4e5969; line-height: 1.75; white-space: pre-wrap; }
    .preview-text { padding: 24px 28px; border: 1px solid #e5e6eb; background: #fff; overflow: auto; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }
    .preview-empty { display: grid; place-content: center; padding: 24px 28px; border: 1px solid #e5e6eb; background: #fff; text-align: center; color: #4e5969; }
    @media (max-width: 960px) { .pdf-native-main { min-height: 520px; } .pdf-page-fallback { padding: 26px 24px; } .word-page { min-height: auto; padding: 40px 28px; } }
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

  private fileStatusToArchiveStatus(status?: FileStatus): ArchiveItemStatus {
    const map: Record<FileStatus, ArchiveItemStatus> = {
      Draft: 'PendingUpload',
      Uploaded: 'Uploaded',
      Reviewing: 'Reviewing',
      Approved: 'Approved',
      Rejected: 'Rejected',
      Deprecated: 'Uploaded',
      Archived: 'Archived',
    };
    return status ? map[status] : 'NotStarted';
  }

  private async resolveArchiveReviewUserId(
    archiveItem: { reviewUserId: string | null; responsibleUserId: string | null } | null,
    uploaderId: string,
  ): Promise<string | null> {
    if (!archiveItem) return null;
    if (archiveItem.reviewUserId) return archiveItem.reviewUserId;
    if (archiveItem.responsibleUserId && archiveItem.responsibleUserId !== uploaderId) {
      return archiveItem.responsibleUserId;
    }

    const elevatedReviewer = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        status: 'Active',
        id: { not: uploaderId },
        userRoles: {
          some: {
            role: {
              roleCode: { in: ['DELIVERY_MANAGER', 'SYSTEM_ADMIN', 'SUPER_ADMIN'] },
            },
          },
        },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    return elevatedReviewer?.id ?? archiveItem.responsibleUserId ?? uploaderId;
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
  return escapeHtml(value).replace(/`/gu, '&#96;');
}
