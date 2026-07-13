import { createHash, createHmac } from 'crypto';
import type { Readable } from 'stream';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type FileAsset } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { enqueueDomainEvent } from '../../common/events/outbox';
import { resolveDocumentConfig } from '../../config/document.config';
import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { OperationLogService } from '../operation-log/operation-log.service';
import { ProjectAccessService } from '../project/project-access.service';
import { ReviewConfigurationService } from '../review/review-configuration.service';
import { ReviewTaskService } from '../review/review-task.service';
import { SystemConfigService } from '../system-config/system-config.service';

import { UploadDraftFileDto } from './dto/upload-draft-file.dto';
import { UploadProjectArchiveFileDto } from './dto/upload-project-archive-file.dto';
import { FileStorageService } from './file-storage.service';
import { withNormalizedUploadFileName } from './upload-file-name.util';

interface UnifiedFileContent {
  stream: Readable;
  fileName: string;
  mimeType: string;
}

type UnifiedFileAccessActor = Pick<JwtPayload, 'sub' | 'permissions' | 'roles'>;
type UnifiedFileAccessAction = 'VIEW' | 'DOWNLOAD' | 'UPDATE';
type UnifiedFileBusinessDomain = 'PROJECT_ARCHIVE' | 'STANDARD' | 'KNOWLEDGE';

const directImageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']);
const officeExtensions = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);
const videoExtensions = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']);
const audioExtensions = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']);
const largeImageThreshold = BigInt(20 * 1024 * 1024);
const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;

const idempotentFileVersionSelect = {
  id: true,
  logicalFileId: true,
  revisionLevel: true,
  changeDescription: true,
  uploadedBy: true,
  status: true,
  archivedAt: true,
  asset: {
    select: {
      originalName: true,
      extension: true,
      mimeType: true,
      size: true,
      checksum: true,
      archivedAt: true,
    },
  },
  logicalFile: {
    select: {
      id: true,
      ownerType: true,
      ownerId: true,
      archivedAt: true,
      projectArchiveFile: {
        select: {
          projectId: true,
          archiveItemId: true,
          archivedAt: true,
        },
      },
    },
  },
} satisfies Prisma.FileVersionSelect;

type IdempotentFileVersion = Prisma.FileVersionGetPayload<{
  select: typeof idempotentFileVersionSelect;
}>;

const previewProcessingJobSelect = {
  id: true,
  type: true,
  status: true,
  progress: true,
  attempts: true,
  availableAt: true,
  errorCode: true,
  errorMessage: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  outputAsset: true,
} satisfies Prisma.FileProcessingJobSelect;

type PreviewProcessingJob = Prisma.FileProcessingJobGetPayload<{
  select: typeof previewProcessingJobSelect;
}>;

interface PreviewAvailability {
  state: 'READY' | 'PROCESSING' | 'UNAVAILABLE';
  reason?: string;
  errorCode?: string | null;
}

@Injectable()
export class UnifiedFileService {
  private readonly logger = new Logger(UnifiedFileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly projectAccess: ProjectAccessService,
    private readonly reviewConfiguration: ReviewConfigurationService,
    private readonly reviewTasks: ReviewTaskService,
    private readonly operationLog: OperationLogService,
    @Optional() private readonly systemConfig?: SystemConfigService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async exists(identifier: string): Promise<boolean> {
    return Boolean(
      await this.prisma.logicalFile.findFirst({
        where: {
          archivedAt: null,
          OR: [{ id: identifier }, { versions: { some: { id: identifier, archivedAt: null } } }],
        },
        select: { id: true },
      }),
    );
  }

  async uploadDraftFile(
    rawFile: Express.Multer.File,
    dto: UploadDraftFileDto,
    actor: UnifiedFileAccessActor,
    rawIdempotencyKey?: string,
  ) {
    this.assertDraftUploadPermission(dto.ownerType, actor);
    const userId = actor.sub;
    const idempotencyKey = this.validateIdempotencyKey(rawIdempotencyKey);
    const file = withNormalizedUploadFileName(rawFile);
    const extension = this.extensionOf(file.originalname);
    await this.assertSystemUploadPolicy(file, extension);
    this.assertFileSignature(file, extension);
    const checksum = this.checksum(file);
    const ownerType = `${dto.ownerType}_DRAFT`;
    if (idempotencyKey) {
      const replay = await this.resolveDraftIdempotentUpload(
        idempotencyKey,
        userId,
        ownerType,
        file,
        checksum,
      );
      if (replay) return this.toDraftUploadResult(replay);
    }
    const logicalFileId = uuidv4();
    const fileVersionId = uuidv4();
    const assetId = uuidv4();
    const storageKey = await this.storage.upload(
      file,
      `drafts/${userId}/${dto.ownerType.toLowerCase()}`,
    );
    const storageBucket = this.storage.getBucketName();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.logicalFile.create({
          data: {
            id: logicalFileId,
            ownerType,
            ownerId: userId,
            displayName: file.originalname,
            status: 'DRAFT',
            createdBy: userId,
          },
        });
        await tx.fileAsset.create({
          data: {
            id: assetId,
            ownerType,
            ownerId: userId,
            originalName: file.originalname,
            extension,
            mimeType: file.mimetype,
            size: BigInt(file.size),
            storageProvider: 'minio',
            storageBucket,
            storageKey,
            checksum,
            createdBy: userId,
          },
        });
        await this.queueProcessingJobs(tx, assetId, extension, file.size);
        await tx.fileVersion.create({
          data: {
            id: fileVersionId,
            idempotencyKey,
            logicalFileId,
            version: 'V1.0',
            versionSequence: 1,
            revisionLevel: 'MINOR',
            assetId,
            status: 'DRAFT',
            changeDescription: dto.changeDescription,
            uploadedBy: userId,
          },
        });
        await tx.logicalFile.update({
          where: { id: logicalFileId },
          data: { currentVersionId: fileVersionId },
        });
        await tx.operationLog.create({
          data: {
            userId,
            module: 'file',
            action: 'upload_draft',
            targetType: 'logical_file',
            targetId: logicalFileId,
            afterData: {
              ownerType: dto.ownerType,
              fileVersionId,
              originalName: file.originalname,
            },
          },
        });
      });
    } catch (error) {
      try {
        await this.storage.deleteFrom(storageBucket, storageKey);
      } catch (cleanupError) {
        this.logger.error(
          `Failed to clean up uncommitted draft ${storageBucket}/${storageKey}`,
          cleanupError,
        );
      }
      if (idempotencyKey && this.isUniqueConstraintConflict(error)) {
        const replay = await this.resolveDraftIdempotentUpload(
          idempotencyKey,
          userId,
          ownerType,
          file,
          checksum,
        );
        if (replay) return this.toDraftUploadResult(replay);
      }
      throw error;
    }
    return {
      logicalFileId,
      fileVersionId,
      fileName: file.originalname,
      extension,
      mimeType: file.mimetype,
      size: file.size,
      status: 'DRAFT',
    };
  }

  async uploadProjectArchiveFile(
    projectId: string,
    archiveItemId: string,
    rawFile: Express.Multer.File,
    dto: UploadProjectArchiveFileDto,
    actor: UnifiedFileAccessActor,
    rawIdempotencyKey?: string,
  ) {
    this.assertPermission(actor, 'archive:upload');
    const userId = actor.sub;
    const idempotencyKey = this.validateIdempotencyKey(rawIdempotencyKey);
    await this.projectAccess.assertProjectAccess(projectId, userId);
    const archiveItem = await this.prisma.projectArchiveEntry.findFirst({
      where: {
        id: archiveItemId,
        projectId,
        archivedAt: null,
        folder: { archivedAt: null },
        project: { deletedAt: null },
      },
      select: {
        id: true,
        name: true,
        folder: { select: { name: true } },
        reviewRequired: true,
        approvalTemplateId: true,
        allowMultipleFiles: true,
        allowedExtensions: true,
        maxFileSize: true,
        namingRule: true,
      },
    });
    if (!archiveItem) {
      throw new NotFoundException('项目档案文件项不存在');
    }

    const file = withNormalizedUploadFileName(rawFile);
    const extension = this.extensionOf(file.originalname);
    await this.assertSystemUploadPolicy(file, extension);
    this.assertUploadPolicy(file, extension, archiveItem);
    const checksum = this.checksum(file);
    if (idempotencyKey) {
      const replay = await this.resolveProjectIdempotentUpload(
        idempotencyKey,
        userId,
        projectId,
        archiveItemId,
        file,
        checksum,
        dto.logicalFileId,
      );
      if (replay) return this.findById(replay.logicalFileId, actor);
    }
    const existing = await this.resolveExistingArchiveFile(
      projectId,
      archiveItemId,
      archiveItem.allowMultipleFiles,
      dto.logicalFileId,
      dto.createNewLogicalFile,
    );
    const logicalFileId = existing?.logicalFileId ?? uuidv4();
    const projectArchiveFileId = existing?.id ?? uuidv4();
    const assetId = uuidv4();
    const fileVersionId = uuidv4();
    const previousVersion = existing
      ? await this.prisma.fileVersion.findFirst({
          where: { logicalFileId, archivedAt: null },
          select: { version: true, versionSequence: true },
          orderBy: { versionSequence: 'desc' },
        })
      : null;
    const nextVersion = this.nextVersion(previousVersion?.version, dto.revisionLevel);
    const versionSequence = (previousVersion?.versionSequence ?? 0) + 1;
    const reviewConfiguration = archiveItem.reviewRequired
      ? await this.reviewConfiguration.resolve(archiveItem.approvalTemplateId, userId, projectId)
      : null;
    const preparedReview = reviewConfiguration
      ? await this.reviewTasks.prepareTask({
          sourceType: 'PROJECT_ARCHIVE',
          sourceId: projectArchiveFileId,
          sourceVersionId: fileVersionId,
          projectId,
          fileVersionId,
          approvalTemplateId: reviewConfiguration.approvalTemplateId,
          approvalTemplateVersion: reviewConfiguration.approvalTemplateVersion,
          approvalSnapshot: reviewConfiguration.snapshot,
          title: `${file.originalname} ${nextVersion}`,
          locationLabel: `${archiveItem.folder.name} / ${archiveItem.name}`,
          reviewMode: reviewConfiguration.reviewMode,
          submittedBy: userId,
          steps: reviewConfiguration.steps,
        })
      : null;

    const storageKey = await this.storage.upload(
      file,
      `projects/${projectId}/archive/${archiveItemId}`,
    );
    const storageBucket = this.storage.getBucketName();
    let reviewTaskId: string | null = null;
    let result: {
      logicalFileId: string;
      fileVersionId: string;
      reviewTaskId: string | null;
    };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        if (!existing) {
          await tx.logicalFile.create({
            data: {
              id: logicalFileId,
              ownerType: 'PROJECT_ARCHIVE',
              ownerId: archiveItemId,
              displayName: file.originalname,
              status: reviewConfiguration ? 'REVIEWING' : 'APPROVED',
              createdBy: userId,
            },
          });
          await tx.projectArchiveFile.create({
            data: {
              id: projectArchiveFileId,
              projectId,
              archiveItemId,
              logicalFileId,
              status: reviewConfiguration ? 'REVIEWING' : 'APPROVED',
              createdBy: userId,
            },
          });
        } else {
          await tx.logicalFile.update({
            where: { id: logicalFileId },
            data: {
              displayName: file.originalname,
              status: reviewConfiguration ? 'REVIEWING' : 'APPROVED',
            },
          });
          await tx.projectArchiveFile.update({
            where: { id: projectArchiveFileId },
            data: { status: reviewConfiguration ? 'REVIEWING' : 'APPROVED' },
          });
        }

        await tx.fileAsset.create({
          data: {
            id: assetId,
            ownerType: 'PROJECT_ARCHIVE',
            ownerId: archiveItemId,
            originalName: file.originalname,
            extension,
            mimeType: file.mimetype,
            size: BigInt(file.size),
            storageProvider: 'minio',
            storageBucket,
            storageKey,
            checksum,
            createdBy: userId,
          },
        });
        await this.queueProcessingJobs(tx, assetId, extension, file.size);
        await tx.fileVersion.create({
          data: {
            id: fileVersionId,
            idempotencyKey,
            logicalFileId,
            version: nextVersion,
            versionSequence,
            revisionLevel: dto.revisionLevel,
            assetId,
            status: reviewConfiguration ? 'UPLOADED' : 'APPROVED',
            changeDescription: dto.changeDescription,
            uploadedBy: userId,
            approvedAt: reviewConfiguration ? null : new Date(),
          },
        });
        if (!reviewConfiguration) {
          await tx.logicalFile.update({
            where: { id: logicalFileId },
            data: { currentVersionId: fileVersionId, status: 'APPROVED' },
          });
        }
        if (preparedReview) {
          reviewTaskId = await this.reviewTasks.createPreparedTask(tx, preparedReview);
        }
        await tx.operationLog.create({
          data: {
            userId,
            module: 'file',
            action: dto.uploadMode === 'REPLACE' ? 'replace' : 'new_version',
            targetType: 'logical_file',
            targetId: logicalFileId,
            afterData: {
              fileVersionId,
              version: nextVersion,
              projectId,
              archiveItemId,
              reviewTaskId,
            },
          },
        });
        await enqueueDomainEvent(tx, {
          eventType: 'ArchiveFileUploaded',
          aggregateType: 'logical_file',
          aggregateId: logicalFileId,
          deduplicationKey: `ArchiveFileUploaded:${fileVersionId}`,
          payload: {
            logicalFileId,
            fileVersionId,
            projectId,
            archiveItemId,
            uploadedBy: userId,
            reviewRequired: Boolean(reviewConfiguration),
          },
        });
        return { logicalFileId, fileVersionId, reviewTaskId };
      });
    } catch (error) {
      try {
        await this.storage.deleteFrom(storageBucket, storageKey);
      } catch (cleanupError) {
        this.logger.error(
          `Failed to clean up uncommitted object ${storageBucket}/${storageKey}`,
          cleanupError,
        );
      }
      if (idempotencyKey && this.isUniqueConstraintConflict(error)) {
        const replay = await this.resolveProjectIdempotentUpload(
          idempotencyKey,
          userId,
          projectId,
          archiveItemId,
          file,
          checksum,
          dto.logicalFileId,
        );
        if (replay) return this.findById(replay.logicalFileId, actor);
      }
      throw error;
    }
    if (preparedReview && result.reviewTaskId) {
      await this.reviewTasks.logPreparedTaskCreated(preparedReview, result.reviewTaskId);
    }
    return this.findById(result.logicalFileId, actor);
  }

  async findById(identifier: string, actor: UnifiedFileAccessActor) {
    const file = await this.getAccessibleLogicalFile(identifier, actor, 'VIEW');
    return {
      id: file.id,
      ownerType: file.ownerType,
      ownerId: file.ownerId,
      displayName: file.displayName,
      status: file.status,
      currentVersion: file.currentVersion,
      archivedAt: file.archivedAt,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  async getVersions(identifier: string, actor: UnifiedFileAccessActor) {
    const file = await this.getAccessibleLogicalFile(identifier, actor, 'VIEW');
    return this.prisma.fileVersion.findMany({
      where: { logicalFileId: file.id, archivedAt: null },
      include: {
        asset: {
          select: {
            id: true,
            originalName: true,
            extension: true,
            mimeType: true,
            size: true,
            checksum: true,
          },
        },
        uploader: { select: { id: true, realName: true } },
      },
      orderBy: { versionSequence: 'desc' },
    });
  }

  async createPreviewSession(identifier: string, actor: JwtPayload) {
    const file = await this.getAccessibleLogicalFile(identifier, actor, 'VIEW');
    const requestedVersion = file.versions?.find((version) => version.id === identifier);
    const current = requestedVersion ?? file.currentVersion;
    if (!current) {
      throw new NotFoundException('文件尚无可预览的当前版本');
    }
    if (requestedVersion && requestedVersion.id !== file.currentVersionId) {
      await this.assertVersionPreviewAccess(requestedVersion, actor);
    }
    const processingJobs = await this.findPreviewProcessingJobs(current.asset.id);
    const resolvedPreview = await this.resolvePreview(current.asset, processingJobs);
    const previewUrl = await this.storage.getPresignedUrlFrom(
      resolvedPreview.asset.storageBucket,
      resolvedPreview.asset.storageKey,
      300,
    );
    await this.operationLog.log({
      userId: actor.sub,
      module: 'file',
      action: 'preview',
      targetType: 'logical_file',
      targetId: file.id,
      afterData: { fileVersionId: current.id },
    });
    const viewerType = resolvedPreview.viewerType;
    const downloadAllowed = this.hasOwnerActionPermission(file.ownerType, actor, 'DOWNLOAD');
    const onlyOffice =
      viewerType === 'ONLYOFFICE_VIEW'
        ? this.buildOnlyOfficeViewSession({
            fileVersionId: current.id,
            fileName: current.asset.originalName,
            extension: current.asset.extension,
            previewUrl,
            downloadAllowed,
            actor,
          })
        : undefined;
    return {
      fileId: requestedVersion?.id ?? file.id,
      fileName: current.asset.originalName,
      mimeType: current.asset.mimeType,
      extension: current.asset.extension,
      viewerType,
      previewUrl,
      availability: resolvedPreview.availability,
      downloadAllowed,
      metadata: {
        version: current.version,
        size: current.asset.size,
        checksum: current.asset.checksum,
        readOnly: true,
      },
      processingStatus: processingJobs.map(({ outputAsset: _outputAsset, ...job }) => job),
      ...(onlyOffice ? { onlyOffice } : {}),
      ...(resolvedPreview.xmind ? { xmind: resolvedPreview.xmind } : {}),
    };
  }

  async download(
    identifier: string,
    actor: UnifiedFileAccessActor,
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<UnifiedFileContent> {
    const file = await this.getAccessibleLogicalFile(identifier, actor, 'DOWNLOAD');
    const requestedVersion = file.versions?.find((version) => version.id === identifier);
    const targetVersion = requestedVersion ?? file.currentVersion;
    if (!targetVersion) {
      throw new NotFoundException('文件尚无可下载的当前版本');
    }
    if (requestedVersion && requestedVersion.id !== file.currentVersionId) {
      await this.assertVersionPreviewAccess(requestedVersion, actor);
    }
    const asset = targetVersion.asset;
    const stream = await this.storage.getObjectFrom(asset.storageBucket, asset.storageKey);
    await this.operationLog.log({
      userId: actor.sub,
      module: 'file',
      action: 'download',
      targetType: 'logical_file',
      targetId: file.id,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      afterData: { fileVersionId: targetVersion.id },
    });
    return { stream, fileName: asset.originalName, mimeType: asset.mimeType };
  }

  async getThumbnail(
    identifier: string,
    actor: UnifiedFileAccessActor,
  ): Promise<UnifiedFileContent | null> {
    const file = await this.getAccessibleLogicalFile(identifier, actor, 'VIEW');
    const requestedVersion = file.versions?.find((version) => version.id === identifier);
    const targetVersion = requestedVersion ?? file.currentVersion;
    if (!targetVersion) return null;
    if (requestedVersion && requestedVersion.id !== file.currentVersionId) {
      await this.assertVersionPreviewAccess(requestedVersion, actor);
    }
    const sourceAsset = targetVersion.asset;
    const completedJob = await this.prisma.fileProcessingJob.findFirst({
      where: {
        fileAssetId: sourceAsset.id,
        type: 'THUMBNAIL',
        status: 'COMPLETED',
        outputAssetId: { not: null },
      },
      include: { outputAsset: true },
      orderBy: { completedAt: 'desc' },
    });
    const asset =
      completedJob?.outputAsset ??
      (directImageExtensions.has(sourceAsset.extension ?? '') ? sourceAsset : null);
    if (!asset) return null;
    return {
      stream: await this.storage.getObjectFrom(asset.storageBucket, asset.storageKey),
      fileName: asset.originalName,
      mimeType: asset.mimeType,
    };
  }

  async getProcessingStatus(identifier: string, actor: UnifiedFileAccessActor) {
    const file = await this.getAccessibleLogicalFile(identifier, actor, 'VIEW');
    const requestedVersion = file.versions?.find((version) => version.id === identifier);
    const targetVersion = requestedVersion ?? file.currentVersion;
    if (!targetVersion) return [];
    if (requestedVersion && requestedVersion.id !== file.currentVersionId) {
      await this.assertVersionPreviewAccess(requestedVersion, actor);
    }
    return this.prisma.fileProcessingJob.findMany({
      where: { fileAssetId: targetVersion.asset.id },
      select: {
        id: true,
        type: true,
        status: true,
        progress: true,
        attempts: true,
        availableAt: true,
        errorCode: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async archive(identifier: string, actor: UnifiedFileAccessActor) {
    const file = await this.getAccessibleLogicalFile(identifier, actor, 'UPDATE');
    const logicalFileId = file.id;
    const archivedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.logicalFile.update({
        where: { id: logicalFileId },
        data: { archivedAt, status: 'ARCHIVED' },
      });
      if (file.projectArchiveFile) {
        await tx.projectArchiveFile.update({
          where: { id: file.projectArchiveFile.id },
          data: { archivedAt, status: 'ARCHIVED' },
        });
      }
      await tx.operationLog.create({
        data: {
          userId: actor.sub,
          module: 'file',
          action: 'archive',
          targetType: 'logical_file',
          targetId: logicalFileId,
        },
      });
    });
    return { id: logicalFileId, archivedAt };
  }

  private validateIdempotencyKey(value?: string): string | null {
    if (value === undefined) return null;
    if (!idempotencyKeyPattern.test(value)) {
      throw new BadRequestException(
        'Idempotency-Key 必须为 8-100 位安全字符（字母、数字、点、下划线、冒号或连字符）',
      );
    }
    return value;
  }

  private async resolveDraftIdempotentUpload(
    idempotencyKey: string,
    userId: string,
    ownerType: string,
    file: Express.Multer.File,
    checksum: string,
  ): Promise<IdempotentFileVersion | null> {
    const existing = await this.findIdempotentFileVersion(idempotencyKey);
    if (!existing) return null;
    const matches =
      existing.uploadedBy === userId &&
      existing.archivedAt === null &&
      existing.logicalFile.archivedAt === null &&
      existing.logicalFile.ownerType === ownerType &&
      existing.logicalFile.ownerId === userId &&
      this.matchesIdempotentContent(existing, file, checksum);
    if (!matches) this.throwIdempotencyConflict();
    return existing;
  }

  private async resolveProjectIdempotentUpload(
    idempotencyKey: string,
    userId: string,
    projectId: string,
    archiveItemId: string,
    file: Express.Multer.File,
    checksum: string,
    requestedLogicalFileId?: string,
  ): Promise<IdempotentFileVersion | null> {
    const existing = await this.findIdempotentFileVersion(idempotencyKey);
    if (!existing) return null;
    const archiveFile = existing.logicalFile.projectArchiveFile;
    const matches =
      existing.uploadedBy === userId &&
      existing.archivedAt === null &&
      existing.logicalFile.archivedAt === null &&
      existing.logicalFile.ownerType === 'PROJECT_ARCHIVE' &&
      existing.logicalFile.ownerId === archiveItemId &&
      archiveFile?.archivedAt === null &&
      archiveFile?.projectId === projectId &&
      archiveFile?.archiveItemId === archiveItemId &&
      (!requestedLogicalFileId || requestedLogicalFileId === existing.logicalFileId) &&
      this.matchesIdempotentContent(existing, file, checksum);
    if (!matches) this.throwIdempotencyConflict();
    return existing;
  }

  private findIdempotentFileVersion(idempotencyKey: string): Promise<IdempotentFileVersion | null> {
    return this.prisma.fileVersion.findUnique({
      where: { idempotencyKey },
      select: idempotentFileVersionSelect,
    });
  }

  private matchesIdempotentContent(
    existing: IdempotentFileVersion,
    file: Express.Multer.File,
    checksum: string,
  ): boolean {
    return (
      existing.asset.archivedAt === null &&
      existing.asset.originalName === file.originalname &&
      existing.asset.size === BigInt(file.size) &&
      existing.asset.checksum === checksum
    );
  }

  private toDraftUploadResult(existing: IdempotentFileVersion) {
    return {
      logicalFileId: existing.logicalFileId,
      fileVersionId: existing.id,
      fileName: existing.asset.originalName,
      extension: existing.asset.extension,
      mimeType: existing.asset.mimeType,
      size: Number(existing.asset.size),
      status: existing.status,
    };
  }

  private throwIdempotencyConflict(): never {
    throw new ConflictException('Idempotency-Key 已被其他上传请求使用');
  }

  private isUniqueConstraintConflict(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as {
      code?: unknown;
    };
    return candidate.code === 'P2002';
  }

  private async resolveExistingArchiveFile(
    projectId: string,
    archiveItemId: string,
    allowMultipleFiles: boolean,
    logicalFileId?: string,
    createNewLogicalFile = false,
  ) {
    if (createNewLogicalFile) {
      if (logicalFileId) {
        throw new BadRequestException('新建独立文件时不能同时指定 logicalFileId');
      }
      if (!allowMultipleFiles) {
        const existing = await this.prisma.projectArchiveFile.findFirst({
          where: {
            projectId,
            archiveItemId,
            archivedAt: null,
            logicalFile: { archivedAt: null },
          },
          select: { id: true },
        });
        if (existing) {
          throw new BadRequestException('该档案项不允许上传多个独立文件');
        }
      }
      return null;
    }
    if (logicalFileId) {
      const selected = await this.prisma.projectArchiveFile.findFirst({
        where: {
          projectId,
          archiveItemId,
          logicalFileId,
          archivedAt: null,
          logicalFile: { archivedAt: null },
        },
        select: { id: true, logicalFileId: true },
      });
      if (!selected) throw new NotFoundException('指定的业务文件不存在');
      return selected;
    }
    const existing = await this.prisma.projectArchiveFile.findMany({
      where: {
        projectId,
        archiveItemId,
        archivedAt: null,
        logicalFile: { archivedAt: null },
      },
      select: { id: true, logicalFileId: true },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    if (!allowMultipleFiles) return existing[0] ?? null;
    if (existing.length === 1) return existing[0];
    if (existing.length > 1) {
      throw new BadRequestException('该档案项包含多个业务文件，请指定 logicalFileId');
    }
    return null;
  }

  private async queueProcessingJobs(
    tx: Prisma.TransactionClient,
    fileAssetId: string,
    extension: string,
    size: number,
  ): Promise<void> {
    const types = new Set<string>();
    if (directImageExtensions.has(extension)) {
      types.add('THUMBNAIL');
      if (BigInt(size) >= largeImageThreshold) types.add('LARGE_IMAGE_TILE');
    } else if (officeExtensions.has(extension)) {
      types.add('PDF_PREVIEW');
      types.add('THUMBNAIL');
    } else if (extension === 'pdf') {
      types.add('THUMBNAIL');
    } else if (extension === 'dwg' || extension === 'dxf') {
      types.add('CAD_CONVERT');
      types.add('THUMBNAIL');
    } else if (extension === 'vsd' || extension === 'vsdx') {
      types.add('VISIO_CONVERT');
      types.add('THUMBNAIL');
    } else if (extension === 'xmind') {
      types.add('XMIND_PARSE');
    } else if (videoExtensions.has(extension)) {
      types.add('VIDEO_TRANSCODE');
      types.add('THUMBNAIL');
    }
    if (types.size === 0) return;
    await tx.fileProcessingJob.createMany({
      data: Array.from(types, (type) => ({
        id: uuidv4(),
        fileAssetId,
        type,
        status: 'PENDING',
        progress: 0,
      })),
    });
  }

  private async getAccessibleLogicalFile(
    identifier: string,
    actor: UnifiedFileAccessActor,
    action: UnifiedFileAccessAction,
  ) {
    const file = await this.prisma.logicalFile.findFirst({
      where: {
        archivedAt: null,
        OR: [{ id: identifier }, { versions: { some: { id: identifier, archivedAt: null } } }],
      },
      include: {
        currentVersion: { include: { asset: true } },
        versions: {
          where: { archivedAt: null },
          include: {
            asset: true,
            reviewTasks: {
              where: { archivedAt: null },
              select: {
                id: true,
                status: true,
                submittedBy: true,
                steps: {
                  select: {
                    assignees: {
                      select: { assigneeUserId: true },
                    },
                  },
                },
              },
            },
          },
        },
        projectArchiveFile: {
          select: {
            id: true,
            projectId: true,
            archiveItemId: true,
            status: true,
          },
        },
      },
    });
    if (!file) throw new NotFoundException('文件不存在');

    const domain = this.resolveBusinessDomain(file.ownerType);
    if (!domain) {
      throw new ForbiddenException('文件业务归属无效，已拒绝访问');
    }

    if (domain === 'PROJECT_ARCHIVE') {
      if (!file.projectArchiveFile) {
        throw new ForbiddenException('项目档案文件缺少有效业务引用，已拒绝访问');
      }
      if (!this.hasOwnerActionPermission(file.ownerType, actor, action)) {
        if (
          action === 'VIEW' &&
          this.canViewReviewFiles(actor) &&
          (await this.isAssignedReviewer(file.id, actor.sub, 'PROJECT_ARCHIVE'))
        ) {
          return file;
        }
        throw new ForbiddenException('当前用户缺少项目档案文件操作权限');
      }
      if (actor.roles.includes('SUPER_ADMIN')) return file;
      try {
        await this.projectAccess.assertProjectAccess(file.projectArchiveFile.projectId, actor.sub);
        return file;
      } catch (error) {
        if (
          action !== 'VIEW' ||
          !this.canViewReviewFiles(actor) ||
          !(await this.isAssignedReviewer(file.id, actor.sub, 'PROJECT_ARCHIVE'))
        ) {
          throw error;
        }
        return file;
      }
    }

    if (file.projectArchiveFile) {
      throw new ForbiddenException('文件业务归属与项目档案引用不一致，已拒绝访问');
    }

    const isDraft = file.ownerType.endsWith('_DRAFT');
    if (isDraft) {
      const ownsDraft = file.ownerId === actor.sub && file.createdBy === actor.sub;
      if (
        (actor.roles.includes('SUPER_ADMIN') || ownsDraft) &&
        this.hasOwnerActionPermission(file.ownerType, actor, action)
      ) {
        return file;
      }
      throw new ForbiddenException('当前用户无权访问该领域的草稿文件');
    }

    const hasActionPermission = this.hasOwnerActionPermission(file.ownerType, actor, action);
    const hasBusinessAccess =
      hasActionPermission &&
      (domain === 'STANDARD'
        ? await this.hasStandardFileAccess(file.id, file.ownerId, actor)
        : await this.hasKnowledgeFileAccess(file.id, file.ownerId, actor));
    if (hasBusinessAccess) return file;

    const reviewSourceType = domain === 'STANDARD' ? 'STANDARD' : 'KNOWLEDGE';
    if (
      action === 'VIEW' &&
      this.canViewReviewFiles(actor) &&
      ((await this.isAssignedReviewer(file.id, actor.sub, reviewSourceType)) ||
        (this.canViewAllReviews(actor) &&
          (await this.hasNonProjectReview(file.id, reviewSourceType))))
    ) {
      return file;
    }

    throw new ForbiddenException('当前用户无权访问该文件');
  }

  private resolveBusinessDomain(ownerType: string): UnifiedFileBusinessDomain | null {
    if (ownerType === 'PROJECT_ARCHIVE') return 'PROJECT_ARCHIVE';
    if (ownerType === 'STANDARD' || ownerType === 'STANDARD_DRAFT') return 'STANDARD';
    if (ownerType === 'KNOWLEDGE' || ownerType === 'KNOWLEDGE_DRAFT') return 'KNOWLEDGE';
    return null;
  }

  private hasOwnerActionPermission(
    ownerType: string,
    actor: UnifiedFileAccessActor,
    action: UnifiedFileAccessAction,
  ): boolean {
    if (actor.roles.includes('SUPER_ADMIN')) return true;
    const domain = this.resolveBusinessDomain(ownerType);
    if (domain === 'PROJECT_ARCHIVE') {
      if (action === 'DOWNLOAD') return actor.permissions.includes('file:download');
      if (action === 'UPDATE') return actor.permissions.includes('file:archive');
      return actor.permissions.some((permission) =>
        [
          'archive:view',
          'archive:upload',
          'archive:version:view',
          'file:preview',
          'file:preview_pending',
          'file:preview_history',
        ].includes(permission),
      );
    }
    if (domain === 'STANDARD') {
      if (action === 'DOWNLOAD') return actor.permissions.includes('standard:download');
      if (action === 'UPDATE') {
        const domainPermission = ownerType === 'STANDARD_DRAFT'
          ? actor.permissions.some((permission) =>
              ['standard:create', 'standard:update_draft'].includes(permission),
            )
          : actor.permissions.includes('standard:archive');
        return actor.permissions.includes('file:archive') && domainPermission;
      }
      return actor.permissions.includes('standard:view');
    }
    if (domain === 'KNOWLEDGE') {
      if (action === 'DOWNLOAD') return actor.permissions.includes('knowledge:download');
      if (action === 'UPDATE') {
        const domainPermission = ownerType === 'KNOWLEDGE_DRAFT'
          ? actor.permissions.some((permission) =>
              ['knowledge:create', 'knowledge:update_draft'].includes(permission),
            )
          : actor.permissions.includes('knowledge:archive');
        return actor.permissions.includes('file:archive') && domainPermission;
      }
      return actor.permissions.includes('knowledge:view');
    }
    return false;
  }

  private assertDraftUploadPermission(
    ownerType: UploadDraftFileDto['ownerType'],
    actor: UnifiedFileAccessActor,
  ): void {
    if (actor.roles.includes('SUPER_ADMIN')) return;
    const permissionPrefix = ownerType === 'STANDARD' ? 'standard' : 'knowledge';
    if (
      actor.permissions.some((permission) =>
        [`${permissionPrefix}:create`, `${permissionPrefix}:update_draft`].includes(permission),
      )
    ) {
      return;
    }
    throw new ForbiddenException(`当前用户缺少${ownerType === 'STANDARD' ? '标准' : '知识'}文件上传权限`);
  }

  private assertPermission(actor: UnifiedFileAccessActor, permission: string): void {
    if (actor.roles.includes('SUPER_ADMIN') || actor.permissions.includes(permission)) return;
    throw new ForbiddenException('当前用户缺少文件操作权限');
  }

  private canViewReviewFiles(actor: UnifiedFileAccessActor): boolean {
    return actor.permissions.some((permission) =>
      [
        'file:preview_pending',
        'file_review:view',
        'file_review:view_all',
        'file_review:act',
        'file_review:manage',
      ].includes(permission),
    );
  }

  private canViewAllReviews(actor: UnifiedFileAccessActor): boolean {
    return (
      actor.roles.includes('SUPER_ADMIN') ||
      actor.permissions.includes('file_review:view_all') ||
      actor.permissions.includes('file_review:manage')
    );
  }

  private async hasNonProjectReview(
    logicalFileId: string,
    sourceType: 'STANDARD' | 'KNOWLEDGE',
  ): Promise<boolean> {
    return Boolean(
      await this.prisma.reviewTask.findFirst({
        where: {
          projectId: null,
          sourceType,
          archivedAt: null,
          fileVersion: { logicalFileId, archivedAt: null },
        },
        select: { id: true },
      }),
    );
  }

  private async isAssignedReviewer(
    logicalFileId: string,
    userId: string,
    sourceType: 'PROJECT_ARCHIVE' | 'STANDARD' | 'KNOWLEDGE',
  ): Promise<boolean> {
    return Boolean(
      await this.prisma.reviewTask.findFirst({
        where: {
          sourceType,
          archivedAt: null,
          status: 'PENDING',
          fileVersion: { logicalFileId },
          steps: {
            some: {
              status: 'ACTIVE',
              assignees: {
                some: { assigneeUserId: userId, status: 'PENDING' },
              },
            },
          },
        },
        select: { id: true },
      }),
    );
  }

  private async hasStandardFileAccess(
    logicalFileId: string,
    standardId: string,
    actor: UnifiedFileAccessActor,
  ): Promise<boolean> {
    const isManager =
      actor.roles.includes('SUPER_ADMIN') ||
      actor.permissions.some((permission) =>
        ['standard:publish', 'standard:archive'].includes(permission),
      );
    const assignedIds = await this.assignedSourceVersionIds('STANDARD', actor.sub);
    return Boolean(
      await this.prisma.standardVersion.findFirst({
        where: {
          standardId,
          archivedAt: null,
          fileVersion: { logicalFileId, archivedAt: null },
          ...(isManager
            ? {}
            : {
                OR: [
                  { status: 'PUBLISHED', standard: { status: 'PUBLISHED' } },
                  { standard: { createdBy: actor.sub } },
                  { submittedBy: actor.sub },
                  ...(assignedIds.length > 0 ? [{ id: { in: assignedIds } }] : []),
                ],
              }),
        },
        select: { id: true },
      }),
    );
  }

  private async hasKnowledgeFileAccess(
    logicalFileId: string,
    knowledgeItemId: string,
    actor: UnifiedFileAccessActor,
  ): Promise<boolean> {
    const isManager =
      actor.roles.includes('SUPER_ADMIN') ||
      actor.permissions.some((permission) =>
        ['knowledge:publish', 'knowledge:archive'].includes(permission),
      );
    const assignedIds = await this.assignedSourceVersionIds('KNOWLEDGE', actor.sub);
    const visibility: Prisma.KnowledgeVersionWhereInput = isManager
      ? {}
      : {
          OR: [
            { status: 'PUBLISHED', knowledgeItem: { status: 'PUBLISHED' } },
            { knowledgeItem: { createdBy: actor.sub } },
            { submittedBy: actor.sub },
            ...(assignedIds.length > 0 ? [{ id: { in: assignedIds } }] : []),
          ],
        };
    return Boolean(
      await this.prisma.knowledgeVersion.findFirst({
        where: {
          knowledgeItemId,
          archivedAt: null,
          AND: [
            visibility,
            {
              OR: [
                { fileVersion: { logicalFileId, archivedAt: null } },
                {
                  supportingFiles: {
                    some: { fileVersion: { logicalFileId, archivedAt: null } },
                  },
                },
              ],
            },
          ],
        },
        select: { id: true },
      }),
    );
  }

  private async assignedSourceVersionIds(
    sourceType: 'STANDARD' | 'KNOWLEDGE',
    userId: string,
  ): Promise<string[]> {
    const tasks = await this.prisma.reviewTask.findMany({
      where: {
        sourceType,
        archivedAt: null,
        sourceVersionId: { not: null },
        steps: {
          some: { assignees: { some: { assigneeUserId: userId } } },
        },
      },
      select: { sourceVersionId: true },
    });
    return tasks.flatMap((task) => (task.sourceVersionId ? [task.sourceVersionId] : []));
  }

  private async assertVersionPreviewAccess(
    version: {
      id: string;
      status: string;
      uploadedBy: string;
      reviewTasks: Array<{
        submittedBy: string;
        steps: Array<{
          assignees: Array<{ assigneeUserId: string }>;
        }>;
      }>;
    },
    actor: UnifiedFileAccessActor,
  ): Promise<void> {
    if (
      actor.roles.includes('SUPER_ADMIN') ||
      version.uploadedBy === actor.sub ||
      actor.permissions.includes('file:preview_history') ||
      actor.permissions.includes('file_review:view_all') ||
      actor.permissions.includes('file_review:manage') ||
      version.reviewTasks.some(
        (task) =>
          task.submittedBy === actor.sub ||
          task.steps.some((step) =>
            step.assignees.some((assignee) => assignee.assigneeUserId === actor.sub),
          ),
      )
    ) {
      return;
    }
    throw new ForbiddenException('当前用户无权预览该文件版本');
  }

  private assertUploadPolicy(
    file: Express.Multer.File,
    extension: string,
    policy: {
      allowedExtensions: Prisma.JsonValue | null;
      maxFileSize: bigint | null;
      namingRule: string | null;
    },
  ): void {
    const allowedExtensions = Array.isArray(policy.allowedExtensions)
      ? policy.allowedExtensions
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.replace(/^\./, '').toLowerCase())
      : [];
    if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
      throw new BadRequestException(`档案项不允许上传 .${extension} 文件`);
    }
    if (policy.maxFileSize !== null && BigInt(file.size) > policy.maxFileSize) {
      throw new BadRequestException('文件大小超过档案项限制');
    }
    if (policy.namingRule && !this.matchesSafeGlob(file.originalname, policy.namingRule)) {
      throw new BadRequestException('文件名不符合档案项命名规则');
    }
    this.assertFileSignature(file, extension);
  }

  private async assertSystemUploadPolicy(
    file: Express.Multer.File,
    extension: string,
  ): Promise<void> {
    if (!this.systemConfig) return;

    const settings = await this.systemConfig.getSettings();
    const allowedExtensions = settings.file.allowedExtensions.map((value) =>
      value.replace(/^\./, '').toLowerCase(),
    );
    if (!allowedExtensions.includes(extension)) {
      throw new BadRequestException(`系统设置不允许上传 .${extension} 文件`);
    }

    const maxBytes = BigInt(settings.attachment.maxSizeMb) * BigInt(1024 * 1024);
    if (BigInt(file.size) > maxBytes) {
      throw new BadRequestException(
        `文件大小超过系统设置的 ${settings.attachment.maxSizeMb} MB 上限`,
      );
    }
  }

  private assertFileSignature(file: Express.Multer.File, extension: string): void {
    const buffer = file.buffer;
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('上传文件内容为空');
    }
    const signatures: Partial<Record<string, (data: Buffer) => boolean>> = {
      pdf: (data) => data.subarray(0, 5).toString('ascii') === '%PDF-',
      png: (data) => data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
      jpg: (data) => data[0] === 0xff && data[1] === 0xd8,
      jpeg: (data) => data[0] === 0xff && data[1] === 0xd8,
      gif: (data) => ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii')),
      zip: (data) => data[0] === 0x50 && data[1] === 0x4b,
      docx: (data) => data[0] === 0x50 && data[1] === 0x4b,
      xlsx: (data) => data[0] === 0x50 && data[1] === 0x4b,
      pptx: (data) => data[0] === 0x50 && data[1] === 0x4b,
    };
    const check = signatures[extension];
    if (check && !check(buffer)) {
      throw new BadRequestException('文件内容与扩展名不匹配');
    }
  }

  private matchesSafeGlob(fileName: string, rule: string): boolean {
    if (rule.length > 200) return false;
    const versionToken = 'VERSIONTOKEN';
    const pattern = rule
      .replace(/\{version\}/giu, versionToken)
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replaceAll(versionToken, 'V?\\d+(?:\\.\\d+){0,2}');
    const matcher = new RegExp(`^${pattern}$`, 'iu');
    const extensionSeparator = fileName.lastIndexOf('.');
    const baseName = extensionSeparator > 0 ? fileName.slice(0, extensionSeparator) : fileName;
    return matcher.test(fileName) || matcher.test(baseName);
  }

  private extensionOf(fileName: string): string {
    const separator = fileName.lastIndexOf('.');
    if (separator <= 0 || separator === fileName.length - 1) {
      throw new BadRequestException('文件缺少有效扩展名');
    }
    return fileName.slice(separator + 1).toLowerCase();
  }

  private checksum(file: Express.Multer.File): string {
    if (!file.buffer) throw new BadRequestException('上传文件内容为空');
    return createHash('sha256').update(file.buffer).digest('hex');
  }

  private nextVersion(
    previousVersion: string | undefined,
    revisionLevel: 'MINOR' | 'MAJOR',
  ): string {
    if (!previousVersion) return 'V1.0';
    const match = /^V?(\d+)\.(\d+)$/i.exec(previousVersion);
    if (!match) throw new ConflictException('现有文件版本号无法自动递增');
    const major = Number(match[1]);
    const minor = Number(match[2]);
    return revisionLevel === 'MAJOR' ? `V${major + 1}.0` : `V${major}.${minor + 1}`;
  }

  private async findPreviewProcessingJobs(fileAssetId: string): Promise<PreviewProcessingJob[]> {
    return this.prisma.fileProcessingJob.findMany({
      where: { fileAssetId },
      select: previewProcessingJobSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  private async resolvePreview(
    sourceAsset: FileAsset,
    jobs: PreviewProcessingJob[],
  ): Promise<{
    viewerType: string;
    asset: FileAsset;
    availability: PreviewAvailability;
    xmind?: { sheets: unknown[] };
  }> {
    const normalized = sourceAsset.extension?.toLowerCase() ?? '';
    if (officeExtensions.has(normalized)) {
      return {
        viewerType: 'ONLYOFFICE_VIEW',
        asset: sourceAsset,
        availability: { state: 'READY' },
      };
    }
    if (normalized === 'pdf') {
      return { viewerType: 'PDF', asset: sourceAsset, availability: { state: 'READY' } };
    }
    if (directImageExtensions.has(normalized)) {
      if (sourceAsset.size < largeImageThreshold) {
        return { viewerType: 'IMAGE', asset: sourceAsset, availability: { state: 'READY' } };
      }
      return this.resolveJobBackedPreview(sourceAsset, jobs, 'LARGE_IMAGE_TILE', 'LARGE_IMAGE');
    }
    if (normalized === 'md' || normalized === 'markdown') {
      return { viewerType: 'MARKDOWN', asset: sourceAsset, availability: { state: 'READY' } };
    }
    if (normalized === 'dwg' || normalized === 'dxf') {
      return this.resolveJobBackedPreview(sourceAsset, jobs, 'CAD_CONVERT', 'CAD_CONVERTED');
    }
    if (normalized === 'vsd' || normalized === 'vsdx') {
      return this.resolveJobBackedPreview(sourceAsset, jobs, 'VISIO_CONVERT', 'VISIO_CONVERTED');
    }
    if (normalized === 'xmind') {
      const resolved = this.resolveJobBackedPreview(sourceAsset, jobs, 'XMIND_PARSE', 'XMIND');
      if (resolved.availability.state !== 'READY' || resolved.asset === sourceAsset)
        return resolved;
      try {
        return { ...resolved, xmind: await this.readXmindOutlineAsset(resolved.asset) };
      } catch {
        this.logger.warn(`Invalid XMind processing output for asset ${sourceAsset.id}`);
        return {
          viewerType: 'UNSUPPORTED',
          asset: sourceAsset,
          availability: {
            state: 'UNAVAILABLE',
            errorCode: 'XMIND_OUTPUT_INVALID',
            reason: 'XMind 解析产物无效，请联系管理员重新处理',
          },
        };
      }
    }
    if (videoExtensions.has(normalized)) {
      return this.resolveJobBackedPreview(sourceAsset, jobs, 'VIDEO_TRANSCODE', 'VIDEO');
    }
    if (audioExtensions.has(normalized)) {
      return { viewerType: 'AUDIO', asset: sourceAsset, availability: { state: 'READY' } };
    }
    return {
      viewerType: 'UNSUPPORTED',
      asset: sourceAsset,
      availability: {
        state: 'UNAVAILABLE',
        errorCode: 'FILE_PREVIEW_UNSUPPORTED',
        reason: '该文件类型暂不支持在线预览',
      },
    };
  }

  private resolveJobBackedPreview(
    sourceAsset: FileAsset,
    jobs: PreviewProcessingJob[],
    jobType: string,
    readyViewerType: string,
  ): {
    viewerType: string;
    asset: FileAsset;
    availability: PreviewAvailability;
  } {
    const job = jobs.find((candidate) => candidate.type === jobType);
    if (job?.status === 'COMPLETED' && job.outputAsset) {
      return {
        viewerType: readyViewerType,
        asset: job.outputAsset,
        availability: { state: 'READY' },
      };
    }
    if (job && ['PENDING', 'PROCESSING'].includes(job.status)) {
      return {
        viewerType: 'UNSUPPORTED',
        asset: sourceAsset,
        availability: {
          state: 'PROCESSING',
          errorCode: 'FILE_PREVIEW_PROCESSING',
          reason: '预览产物正在生成，请稍后重试',
        },
      };
    }
    return {
      viewerType: 'UNSUPPORTED',
      asset: sourceAsset,
      availability: {
        state: 'UNAVAILABLE',
        errorCode: job?.errorCode ?? 'FILE_PROCESSING_JOB_MISSING',
        reason: job?.errorMessage ?? '预览转换尚不可用，可在有权限时下载原文件',
      },
    };
  }

  private async readXmindOutlineAsset(asset: FileAsset): Promise<{ sheets: unknown[] }> {
    const stream = await this.storage.getObjectFrom(asset.storageBucket, asset.storageKey);
    const data = await this.readLimitedStream(stream, 10 * 1024 * 1024);
    const parsed = JSON.parse(data.toString('utf8')) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as { sheets?: unknown }).sheets)
    ) {
      throw new Error('XMIND_OUTPUT_INVALID');
    }
    return { sheets: (parsed as { sheets: unknown[] }).sheets };
  }

  private async readLimitedStream(stream: Readable, maxBytes: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += buffer.length;
      if (size > maxBytes) throw new Error('FILE_PREVIEW_OUTPUT_TOO_LARGE');
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, size);
  }

  private buildOnlyOfficeViewSession(input: {
    fileVersionId: string;
    fileName: string;
    extension: string | null;
    previewUrl: string;
    downloadAllowed: boolean;
    actor: UnifiedFileAccessActor & Pick<JwtPayload, 'username' | 'realName'>;
  }) {
    const fallbackConfig = this.configService ? null : resolveDocumentConfig();
    const docsUrl = this.normalizeBaseUrl(
      this.configService?.get<string>('document.onlyOfficeDocsUrl') ??
        fallbackConfig?.onlyOfficeDocsUrl ??
        '',
    );
    const secret = (
      this.configService?.get<string>('document.onlyOfficeJwtSecret') ??
      fallbackConfig?.onlyOfficeJwtSecret ??
      ''
    ).trim();
    const extension = input.extension?.toLowerCase() ?? '';
    const documentType = ['doc', 'docx'].includes(extension)
      ? 'word'
      : ['xls', 'xlsx'].includes(extension)
        ? 'cell'
        : ['ppt', 'pptx'].includes(extension)
          ? 'slide'
          : null;
    if (!docsUrl || !documentType || !secret) {
      return {
        available: false,
        docsUrl: docsUrl || undefined,
        reason:
          !docsUrl || !documentType
            ? 'ONLYOFFICE Docs 未配置，暂时只能下载原文件。'
            : 'ONLYOFFICE JWT 签名密钥未配置，已禁止创建未签名预览会话。',
      };
    }
    const config: Record<string, unknown> = {
      type: 'desktop',
      documentType,
      width: '100%',
      height: '100%',
      document: {
        fileType: extension,
        key: input.fileVersionId,
        title: input.fileName,
        url: input.previewUrl,
        permissions: {
          comment: false,
          copy: true,
          download: input.downloadAllowed,
          edit: false,
          print: input.downloadAllowed,
          review: false,
        },
      },
      editorConfig: {
        lang: 'zh-CN',
        mode: 'view',
        user: {
          id: input.actor.sub,
          name: input.actor.realName || input.actor.username,
        },
        customization: {
          autosave: false,
          compactHeader: true,
          forcesave: false,
        },
      },
    };
    config.token = this.signJsonWebToken(config, secret);
    return { available: true, docsUrl, config };
  }

  private signJsonWebToken(payload: Record<string, unknown>, secret: string): string {
    const encode = (value: object): string =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const body = encode(payload);
    const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  private normalizeBaseUrl(value: string): string {
    return value.trim().replace(/\/+$/u, '');
  }
}
