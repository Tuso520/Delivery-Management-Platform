import type { Readable } from 'stream';

import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
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

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
    private readonly projectAccess: ProjectAccessService,
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

    // Verify archive item if provided
    if (archiveItemId) {
      const archiveItem = await this.prisma.projectArchiveItem.findFirst({
        where: { id: archiveItemId, projectId },
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
          fileStatus: 'Uploaded',
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
          data: { status: 'Uploaded' },
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

  /**
   * Check if a user has access to a project through its project.
   * Elevated roles (SUPER_ADMIN, SYSTEM_ADMIN, DELIVERY_MANAGER) bypass the check.
   * Other users must be a member of the project.
   */
  private async checkProjectAccess(projectId: string, userId: string): Promise<void> {
    await this.projectAccess.assertProjectAccess(projectId, userId);
  }
}
