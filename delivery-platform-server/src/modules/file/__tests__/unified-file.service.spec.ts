import { createHash, createHmac } from 'crypto';
import { Readable } from 'stream';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import type { OperationLogService } from '../../operation-log/operation-log.service';
import type { ProjectAccessService } from '../../project/project-access.service';
import type { ReviewConfigurationService } from '../../review/review-configuration.service';
import type { ReviewTaskService } from '../../review/review-task.service';
import type { SystemConfigService } from '../../system-config/system-config.service';
import type { FileStorageService } from '../file-storage.service';
import { UnifiedFileService } from '../unified-file.service';

describe('UnifiedFileService', () => {
  const projectAccess = {
    assertProjectAccess: jest.fn().mockResolvedValue(undefined),
  } as unknown as ProjectAccessService;
  const reviewConfiguration = {
    resolve: jest.fn(),
  } as unknown as ReviewConfigurationService;
  const reviewTasks = {
    prepareTask: jest.fn(),
    createPreparedTask: jest.fn(),
    logPreparedTaskCreated: jest.fn(),
  } as unknown as ReviewTaskService;
  const operationLog = {
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as OperationLogService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects extensions disabled in system settings before writing object storage', async () => {
    const storage = { upload: jest.fn() } as unknown as FileStorageService;
    const systemConfig = {
      getSettings: jest.fn().mockResolvedValue({
        attachment: { maxSizeMb: 100 },
        file: { allowedExtensions: ['docx'] },
      }),
    } as unknown as SystemConfigService;
    const service = new UnifiedFileService(
      {} as PrismaService,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
      systemConfig,
    );

    await expect(
      service.uploadDraftFile(pdfFile(), { ownerType: 'STANDARD' }, fileActor(['standard:create'])),
    ).rejects.toThrow('系统设置不允许上传 .pdf 文件');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rejects files above the editable system size limit before writing object storage', async () => {
    const storage = { upload: jest.fn() } as unknown as FileStorageService;
    const systemConfig = {
      getSettings: jest.fn().mockResolvedValue({
        attachment: { maxSizeMb: 1 },
        file: { allowedExtensions: ['pdf'] },
      }),
    } as unknown as SystemConfigService;
    const file = pdfFile();
    file.size = 2 * 1024 * 1024;
    const service = new UnifiedFileService(
      {} as PrismaService,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
      systemConfig,
    );

    await expect(
      service.uploadDraftFile(file, { ownerType: 'KNOWLEDGE' }, fileActor(['knowledge:create'])),
    ).rejects.toThrow('文件大小超过系统设置的 1 MB 上限');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('creates immutable asset/version rows and promotes a no-review upload atomically', async () => {
    const transaction = {
      logicalFile: {
        create: jest.fn().mockResolvedValue({ id: 'logical-1' }),
        update: jest.fn().mockResolvedValue({ id: 'logical-1' }),
      },
      projectArchiveFile: {
        create: jest.fn().mockResolvedValue({ id: 'archive-file-1' }),
      },
      fileAsset: { create: jest.fn().mockResolvedValue({ id: 'asset-1' }) },
      fileProcessingJob: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      fileVersion: { create: jest.fn().mockResolvedValue({ id: 'version-1' }) },
      operationLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) },
    };
    const prisma = {
      projectArchiveEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          name: '设计图纸',
          folder: { name: '设计文件' },
          reviewRequired: false,
          approvalTemplateId: null,
          allowMultipleFiles: false,
          allowedExtensions: ['pdf'],
          maxFileSize: BigInt(1024),
          namingRule: 'drawing-{version}',
        }),
      },
      projectArchiveFile: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'archive-file-existing', logicalFileId: 'logical-existing' }]),
      },
      logicalFile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'logical-1',
          ownerType: 'PROJECT_ARCHIVE',
          ownerId: 'item-1',
          displayName: 'drawing.pdf',
          status: 'APPROVED',
          currentVersion: { id: 'version-1', asset: {} },
          projectArchiveFile: { id: 'archive-file-1', projectId: 'project-1' },
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const storage = {
      upload: jest.fn().mockResolvedValue('projects/project-1/file.pdf'),
      getBucketName: jest.fn().mockReturnValue('delivery-platform'),
      deleteFrom: jest.fn(),
    } as unknown as FileStorageService;
    const service = new UnifiedFileService(
      prisma,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    await service.uploadProjectArchiveFile(
      'project-1',
      'item-1',
      pdfFile('drawing-V1.2.pdf'),
      {
        uploadMode: 'NEW_VERSION',
        revisionLevel: 'MINOR',
        createNewLogicalFile: true,
      },
      fileActor(['archive:upload']),
    );

    expect(transaction.fileAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerType: 'PROJECT_ARCHIVE',
        storageBucket: 'delivery-platform',
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(transaction.fileVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 'V1.0',
        versionSequence: 1,
        status: 'APPROVED',
      }),
    });
    expect(transaction.projectArchiveFile.create).toHaveBeenCalled();
    expect(transaction.fileProcessingJob.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          fileAssetId: expect.any(String),
          type: 'THUMBNAIL',
          status: 'PENDING',
        }),
      ],
    });
    expect(transaction.logicalFile.update).toHaveBeenLastCalledWith({
      where: { id: expect.any(String) },
      data: { currentVersionId: expect.any(String), status: 'APPROVED' },
    });
    expect(reviewTasks.prepareTask).not.toHaveBeenCalled();

    (prisma.projectArchiveFile.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'archive-file-existing',
    });
    await expect(
      service.uploadProjectArchiveFile(
        'project-1',
        'item-1',
        pdfFile('drawing-V1.3.pdf'),
        {
          uploadMode: 'NEW_VERSION',
          revisionLevel: 'MINOR',
          createNewLogicalFile: true,
        },
        fileActor(['archive:upload']),
      ),
    ).rejects.toThrow(new BadRequestException('该档案项不允许上传多个独立文件'));
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it('creates a controlled draft FileVersion for standard and knowledge forms', async () => {
    const transaction = {
      logicalFile: {
        create: jest.fn().mockResolvedValue({ id: 'logical-draft' }),
        update: jest.fn().mockResolvedValue({ id: 'logical-draft' }),
      },
      fileAsset: { create: jest.fn().mockResolvedValue({ id: 'asset-draft' }) },
      fileProcessingJob: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      fileVersion: { create: jest.fn().mockResolvedValue({ id: 'version-draft' }) },
      operationLog: { create: jest.fn().mockResolvedValue({ id: 'log-draft' }) },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const storage = {
      upload: jest.fn().mockResolvedValue('drafts/user-1/standard/drawing.pdf'),
      getBucketName: jest.fn().mockReturnValue('delivery-platform'),
      deleteFrom: jest.fn(),
    } as unknown as FileStorageService;
    const service = new UnifiedFileService(
      prisma,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    const result = await service.uploadDraftFile(
      pdfFile(),
      { ownerType: 'STANDARD', changeDescription: '初稿' },
      fileActor(['standard:create']),
    );

    expect(result).toEqual(
      expect.objectContaining({ fileVersionId: expect.any(String), status: 'DRAFT' }),
    );
    expect(transaction.logicalFile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerType: 'STANDARD_DRAFT',
        ownerId: 'user-1',
        status: 'DRAFT',
      }),
    });
    expect(transaction.fileVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'DRAFT', version: 'V1.0' }),
    });
  });

  it.each([
    ['STANDARD' as const, ['knowledge:create', 'knowledge:update_draft']],
    ['KNOWLEDGE' as const, ['standard:create', 'standard:update_draft']],
  ])(
    'rejects a %s draft upload authorized only by the other business domain',
    async (ownerType, permissions) => {
      const storage = { upload: jest.fn() } as unknown as FileStorageService;
      const service = new UnifiedFileService(
        {} as PrismaService,
        storage,
        projectAccess,
        reviewConfiguration,
        reviewTasks,
        operationLog,
      );

      await expect(
        service.uploadDraftFile(pdfFile(), { ownerType }, fileActor(permissions)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(storage.upload).not.toHaveBeenCalled();
    },
  );

  it('stores the idempotency key only when creating a new draft version', async () => {
    const transaction = {
      logicalFile: {
        create: jest.fn().mockResolvedValue({ id: 'logical-new' }),
        update: jest.fn().mockResolvedValue({ id: 'logical-new' }),
      },
      fileAsset: { create: jest.fn().mockResolvedValue({ id: 'asset-new' }) },
      fileProcessingJob: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      fileVersion: { create: jest.fn().mockResolvedValue({ id: 'version-new' }) },
      operationLog: { create: jest.fn().mockResolvedValue({ id: 'log-new' }) },
    };
    const prisma = {
      fileVersion: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const storage = {
      upload: jest.fn().mockResolvedValue('drafts/user-1/standard/drawing.pdf'),
      getBucketName: jest.fn().mockReturnValue('delivery-platform'),
      deleteFrom: jest.fn(),
    } as unknown as FileStorageService;
    const service = new UnifiedFileService(
      prisma,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    await service.uploadDraftFile(
      pdfFile(),
      { ownerType: 'STANDARD' },
      fileActor(['standard:create']),
      'draft-key-0001',
    );

    expect(transaction.fileVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ idempotencyKey: 'draft-key-0001' }),
    });
  });

  it('replays a completed draft upload without touching object storage', async () => {
    const file = pdfFile();
    const completed = idempotentVersion(file, {
      ownerType: 'STANDARD_DRAFT',
      ownerId: 'user-1',
    });
    const prisma = {
      fileVersion: { findUnique: jest.fn().mockResolvedValue(completed) },
    } as unknown as PrismaService;
    const storage = {
      upload: jest.fn(),
      deleteFrom: jest.fn(),
    } as unknown as FileStorageService;
    const service = new UnifiedFileService(
      prisma,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    const result = await service.uploadDraftFile(
      file,
      { ownerType: 'STANDARD' },
      fileActor(['standard:create']),
      'draft-key-0001',
    );

    expect(result).toEqual({
      logicalFileId: 'logical-idempotent',
      fileVersionId: 'version-idempotent',
      fileName: 'drawing.pdf',
      extension: 'pdf',
      mimeType: 'application/pdf',
      size: file.size,
      status: 'DRAFT',
    });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.deleteFrom).not.toHaveBeenCalled();
  });

  it('replays a completed project archive upload in the same archive item', async () => {
    const file = pdfFile();
    const completed = idempotentVersion(file, {
      ownerType: 'PROJECT_ARCHIVE',
      ownerId: 'item-1',
      projectId: 'project-1',
      archiveItemId: 'item-1',
    });
    const prisma = {
      projectArchiveEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          name: 'archive item',
          folder: { name: 'archive folder' },
          reviewRequired: false,
          approvalTemplateId: null,
          allowMultipleFiles: true,
          allowedExtensions: ['pdf'],
          maxFileSize: BigInt(1024),
          namingRule: '*.pdf',
        }),
      },
      fileVersion: { findUnique: jest.fn().mockResolvedValue(completed) },
    } as unknown as PrismaService;
    const storage = { upload: jest.fn() } as unknown as FileStorageService;
    const service = new UnifiedFileService(
      prisma,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );
    const replayResult = { id: 'logical-idempotent', status: 'APPROVED' };
    jest.spyOn(service, 'findById').mockResolvedValue(replayResult as never);

    await expect(
      service.uploadProjectArchiveFile(
        'project-1',
        'item-1',
        file,
        { uploadMode: 'NEW_VERSION', revisionLevel: 'MINOR' },
        fileActor(['archive:upload']),
        'archive-key-0001',
      ),
    ).resolves.toEqual(replayResult);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(reviewConfiguration.resolve).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key reused with different content before storage', async () => {
    const file = pdfFile();
    const completed = idempotentVersion(file, {
      ownerType: 'STANDARD_DRAFT',
      ownerId: 'user-1',
    });
    completed.asset.checksum = 'different-checksum';
    const prisma = {
      fileVersion: { findUnique: jest.fn().mockResolvedValue(completed) },
    } as unknown as PrismaService;
    const storage = {
      upload: jest.fn(),
      deleteFrom: jest.fn(),
    } as unknown as FileStorageService;
    const service = new UnifiedFileService(
      prisma,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    await expect(
      service.uploadDraftFile(
        file,
        { ownerType: 'STANDARD' },
        fileActor(['standard:create']),
        'draft-key-0001',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.deleteFrom).not.toHaveBeenCalled();
  });

  it('rejects an unsafe idempotency key before database or storage work', async () => {
    const prisma = {
      fileVersion: { findUnique: jest.fn() },
    } as unknown as PrismaService;
    const storage = { upload: jest.fn() } as unknown as FileStorageService;
    const service = new UnifiedFileService(
      prisma,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    await expect(
      service.uploadDraftFile(
        pdfFile(),
        { ownerType: 'STANDARD' },
        fileActor(['standard:create']),
        'bad key',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.fileVersion.findUnique).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('cleans the losing object after a concurrent key collision and replays thereafter', async () => {
    const file = pdfFile();
    const completed = idempotentVersion(file, {
      ownerType: 'STANDARD_DRAFT',
      ownerId: 'user-1',
    });
    const prisma = {
      fileVersion: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValue(completed),
      },
      $transaction: jest.fn().mockRejectedValue({
        code: 'P2002',
        meta: { target: ['idempotencyKey'] },
      }),
    } as unknown as PrismaService;
    const storage = {
      upload: jest.fn().mockResolvedValue('drafts/user-1/standard/loser.pdf'),
      getBucketName: jest.fn().mockReturnValue('delivery-platform'),
      deleteFrom: jest.fn().mockResolvedValue(undefined),
    } as unknown as FileStorageService;
    const service = new UnifiedFileService(
      prisma,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    const firstResult = await service.uploadDraftFile(
      file,
      { ownerType: 'STANDARD' },
      fileActor(['standard:create']),
      'draft-key-0001',
    );
    const retryResult = await service.uploadDraftFile(
      file,
      { ownerType: 'STANDARD' },
      fileActor(['standard:create']),
      'draft-key-0001',
    );

    expect(firstResult).toEqual(retryResult);
    expect(storage.deleteFrom).toHaveBeenCalledWith(
      'delivery-platform',
      'drafts/user-1/standard/loser.pdf',
    );
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('fails closed before storage when review is required but no template is configured', async () => {
    const prisma = {
      projectArchiveEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          name: '设计图纸',
          folder: { name: '设计文件' },
          reviewRequired: true,
          approvalTemplateId: null,
          allowMultipleFiles: false,
          allowedExtensions: ['pdf'],
          maxFileSize: null,
          namingRule: null,
        }),
      },
      projectArchiveFile: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const storage = { upload: jest.fn() } as unknown as FileStorageService;
    (reviewConfiguration.resolve as jest.Mock).mockRejectedValueOnce(
      new UnprocessableEntityException('要求审核，但未配置审批模板'),
    );
    const service = new UnifiedFileService(
      prisma,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    await expect(
      service.uploadProjectArchiveFile(
        'project-1',
        'item-1',
        pdfFile(),
        { uploadMode: 'NEW_VERSION', revisionLevel: 'MINOR' },
        fileActor(['archive:upload']),
      ),
    ).rejects.toThrow(new UnprocessableEntityException('要求审核，但未配置审批模板'));
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it.each([
    ['standard manager', 'standard:archive', 'STANDARD', 'standard-1'],
    ['knowledge manager', 'knowledge:archive', 'KNOWLEDGE', 'knowledge-1'],
  ])(
    'archives a file through the %s entry with the complete actor context',
    async (_label, permission, ownerType, ownerId) => {
      const logicalFile = {
        ...previewLogicalFile('pdf'),
        ownerType,
        ownerId,
        createdBy: 'creator-1',
        projectArchiveFile: null,
      };
      const transaction = {
        logicalFile: { update: jest.fn().mockResolvedValue({ id: logicalFile.id }) },
        projectArchiveFile: { update: jest.fn() },
        operationLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
      };
      const prisma = {
        logicalFile: { findFirst: jest.fn().mockResolvedValue(logicalFile) },
        reviewTask: { findMany: jest.fn().mockResolvedValue([]) },
        standardVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'standard-version-1' }) },
        knowledgeVersion: {
          findFirst: jest.fn().mockResolvedValue({ id: 'knowledge-version-1' }),
        },
        $transaction: jest
          .fn()
          .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
          ),
      } as unknown as PrismaService;
      const service = new UnifiedFileService(
        prisma,
        {} as FileStorageService,
        projectAccess,
        reviewConfiguration,
        reviewTasks,
        operationLog,
      );
      const actor = {
        sub: 'manager-1',
        permissions: ['file:archive', permission],
        roles: [],
      };

      await service.archive(logicalFile.id, actor);

      expect(transaction.logicalFile.update).toHaveBeenCalledWith({
        where: { id: logicalFile.id },
        data: { archivedAt: expect.any(Date), status: 'ARCHIVED' },
      });
      expect(transaction.operationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: actor.sub, action: 'archive' }),
      });
      if (ownerType === 'STANDARD') {
        expect(prisma.standardVersion.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ standardId: ownerId }) }),
        );
        expect(prisma.knowledgeVersion.findFirst).not.toHaveBeenCalled();
      } else {
        expect(prisma.knowledgeVersion.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ knowledgeItemId: ownerId }) }),
        );
        expect(prisma.standardVersion.findFirst).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    ['STANDARD' as const, 'standard-1'],
    ['KNOWLEDGE' as const, 'knowledge-1'],
  ])(
    'fails closed when %s ownership has no matching business reference',
    async (ownerType, ownerId) => {
      const logicalFile = businessLogicalFile(ownerType, ownerId);
      const standardFindFirst = jest
        .fn()
        .mockResolvedValue(ownerType === 'STANDARD' ? null : { id: 'other-standard-version' });
      const knowledgeFindFirst = jest
        .fn()
        .mockResolvedValue(ownerType === 'KNOWLEDGE' ? null : { id: 'other-knowledge-version' });
      const prisma = {
        logicalFile: { findFirst: jest.fn().mockResolvedValue(logicalFile) },
        reviewTask: { findMany: jest.fn().mockResolvedValue([]) },
        standardVersion: { findFirst: standardFindFirst },
        knowledgeVersion: { findFirst: knowledgeFindFirst },
      } as unknown as PrismaService;
      const service = new UnifiedFileService(
        prisma,
        {} as FileStorageService,
        projectAccess,
        reviewConfiguration,
        reviewTasks,
        operationLog,
      );

      await expect(
        service.findById(
          logicalFile.id,
          fileActor(['standard:view', 'knowledge:view'], 'reader-1'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      if (ownerType === 'STANDARD') {
        expect(standardFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ standardId: ownerId }) }),
        );
        expect(knowledgeFindFirst).not.toHaveBeenCalled();
      } else {
        expect(knowledgeFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ knowledgeItemId: ownerId }),
          }),
        );
        expect(standardFindFirst).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    ['STANDARD' as const, 'standard-1', ['standard:view', 'knowledge:download']],
    ['KNOWLEDGE' as const, 'knowledge-1', ['knowledge:view', 'standard:download']],
  ])(
    'does not combine %s visibility with the other domain download permission',
    async (ownerType, ownerId, permissions) => {
      const logicalFile = businessLogicalFile(ownerType, ownerId);
      const prisma = {
        logicalFile: { findFirst: jest.fn().mockResolvedValue(logicalFile) },
        reviewTask: { findMany: jest.fn().mockResolvedValue([]) },
        standardVersion: {
          findFirst: jest.fn().mockResolvedValue({ id: 'standard-version-1' }),
        },
        knowledgeVersion: {
          findFirst: jest.fn().mockResolvedValue({ id: 'knowledge-version-1' }),
        },
      } as unknown as PrismaService;
      const storage = {
        getObjectFrom: jest.fn().mockResolvedValue(Readable.from('business bytes')),
      } as unknown as FileStorageService;
      const service = new UnifiedFileService(
        prisma,
        storage,
        projectAccess,
        reviewConfiguration,
        reviewTasks,
        operationLog,
      );

      await expect(
        service.download(logicalFile.id, fileActor(permissions, 'reader-1')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(storage.getObjectFrom).not.toHaveBeenCalled();
      expect(prisma.standardVersion.findFirst).not.toHaveBeenCalled();
      expect(prisma.knowledgeVersion.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['STANDARD' as const, 'standard-1', ['standard:view', 'knowledge:download']],
    ['KNOWLEDGE' as const, 'knowledge-1', ['knowledge:view', 'standard:download']],
  ])(
    'does not advertise the other domain download permission in a %s preview session',
    async (ownerType, ownerId, permissions) => {
      const logicalFile = businessLogicalFile(ownerType, ownerId);
      const standardFindFirst = jest.fn().mockResolvedValue({ id: 'standard-version-1' });
      const knowledgeFindFirst = jest.fn().mockResolvedValue({ id: 'knowledge-version-1' });
      const prisma = {
        logicalFile: { findFirst: jest.fn().mockResolvedValue(logicalFile) },
        reviewTask: { findMany: jest.fn().mockResolvedValue([]) },
        standardVersion: { findFirst: standardFindFirst },
        knowledgeVersion: { findFirst: knowledgeFindFirst },
        fileProcessingJob: { findMany: jest.fn().mockResolvedValue([]) },
      } as unknown as PrismaService;
      const storage = {
        getPresignedUrlFrom: jest.fn().mockResolvedValue('https://files.test/business'),
      } as unknown as FileStorageService;
      const service = new UnifiedFileService(
        prisma,
        storage,
        projectAccess,
        reviewConfiguration,
        reviewTasks,
        operationLog,
      );

      const session = await service.createPreviewSession(logicalFile.id, {
        ...fileActor(permissions, 'reader-1'),
        username: 'reader',
        realName: '领域阅读者',
        email: null,
        permissionVersion: 1,
      });

      expect(session.downloadAllowed).toBe(false);
      if (ownerType === 'STANDARD') {
        expect(standardFindFirst).toHaveBeenCalled();
        expect(knowledgeFindFirst).not.toHaveBeenCalled();
      } else {
        expect(knowledgeFindFirst).toHaveBeenCalled();
        expect(standardFindFirst).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    ['STANDARD' as const, 'standard-1', ['file:archive', 'standard:view', 'knowledge:archive']],
    ['KNOWLEDGE' as const, 'knowledge-1', ['file:archive', 'knowledge:view', 'standard:archive']],
  ])(
    'does not combine %s visibility with the other domain update permission',
    async (ownerType, ownerId, permissions) => {
      const logicalFile = businessLogicalFile(ownerType, ownerId);
      const transaction = {
        logicalFile: { update: jest.fn() },
        projectArchiveFile: { update: jest.fn() },
        operationLog: { create: jest.fn() },
      };
      const prisma = {
        logicalFile: { findFirst: jest.fn().mockResolvedValue(logicalFile) },
        reviewTask: { findMany: jest.fn().mockResolvedValue([]) },
        standardVersion: {
          findFirst: jest.fn().mockResolvedValue({ id: 'standard-version-1' }),
        },
        knowledgeVersion: {
          findFirst: jest.fn().mockResolvedValue({ id: 'knowledge-version-1' }),
        },
        $transaction: jest.fn(),
      } as unknown as PrismaService;
      const service = new UnifiedFileService(
        prisma,
        {} as FileStorageService,
        projectAccess,
        reviewConfiguration,
        reviewTasks,
        operationLog,
      );

      await expect(
        service.archive(logicalFile.id, fileActor(permissions, 'reader-1')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(transaction.logicalFile.update).not.toHaveBeenCalled();
      expect(prisma.standardVersion.findFirst).not.toHaveBeenCalled();
      expect(prisma.knowledgeVersion.findFirst).not.toHaveBeenCalled();
    },
  );

  it('returns a short read-only preview session for the approved current version', async () => {
    const prisma = {
      logicalFile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'logical-1',
          ownerType: 'PROJECT_ARCHIVE',
          ownerId: 'archive-entry-1',
          createdBy: 'user-1',
          currentVersionId: 'version-1',
          currentVersion: {
            id: 'version-1',
            version: 'V1.0',
            status: 'APPROVED',
            uploadedBy: 'user-1',
            reviewTasks: [],
            asset: {
              id: 'asset-1',
              originalName: 'drawing.pdf',
              extension: 'pdf',
              mimeType: 'application/pdf',
              size: BigInt(128),
              checksum: 'abc',
              storageBucket: 'delivery-platform',
              storageKey: 'drawing.pdf',
            },
          },
          versions: [
            {
              id: 'version-1',
              version: 'V1.0',
              status: 'APPROVED',
              uploadedBy: 'user-1',
              reviewTasks: [],
              asset: {
                id: 'asset-1',
                originalName: 'drawing.pdf',
                extension: 'pdf',
                mimeType: 'application/pdf',
                size: BigInt(128),
                checksum: 'abc',
                storageBucket: 'delivery-platform',
                storageKey: 'drawing.pdf',
              },
            },
          ],
          projectArchiveFile: { projectId: 'project-1' },
        }),
      },
      fileProcessingJob: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const storage = {
      getPresignedUrlFrom: jest.fn().mockResolvedValue('https://files.test/signed'),
    } as unknown as FileStorageService;
    const service = new UnifiedFileService(
      prisma,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    const session = await service.createPreviewSession('logical-1', {
      sub: 'user-1',
      username: 'user',
      realName: '测试用户',
      email: null,
      roles: [],
      permissions: ['file:preview'],
      permissionVersion: 1,
    });

    expect(session).toEqual(
      expect.objectContaining({
        fileId: 'logical-1',
        viewerType: 'PDF',
        previewUrl: 'https://files.test/signed',
        downloadAllowed: false,
        metadata: expect.objectContaining({ readOnly: true }),
      }),
    );
  });

  it('creates a signed ONLYOFFICE view-only session without granting edit capabilities', async () => {
    const previousDocsUrl = process.env.ONLYOFFICE_DOCS_URL;
    const previousJwtSecret = process.env.ONLYOFFICE_JWT_SECRET;
    process.env.ONLYOFFICE_DOCS_URL = 'https://office.test/';
    process.env.ONLYOFFICE_JWT_SECRET = 'onlyoffice-test-secret';

    try {
      const prisma = {
        logicalFile: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'logical-office',
            ownerType: 'PROJECT_ARCHIVE',
            ownerId: 'entry-1',
            currentVersionId: 'version-office',
            currentVersion: {
              id: 'version-office',
              version: 'V2.0',
              status: 'APPROVED',
              uploadedBy: 'user-1',
              reviewTasks: [],
              asset: {
                id: 'asset-office',
                originalName: 'delivery-plan.docx',
                extension: 'docx',
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                size: BigInt(512),
                checksum: 'office-checksum',
                storageBucket: 'delivery-platform',
                storageKey: 'delivery-plan.docx',
              },
            },
            versions: [
              {
                id: 'version-office',
                version: 'V2.0',
                status: 'APPROVED',
                uploadedBy: 'user-1',
                reviewTasks: [],
                asset: {
                  id: 'asset-office',
                  originalName: 'delivery-plan.docx',
                  extension: 'docx',
                  mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  size: BigInt(512),
                  checksum: 'office-checksum',
                  storageBucket: 'delivery-platform',
                  storageKey: 'delivery-plan.docx',
                },
              },
            ],
            projectArchiveFile: { projectId: 'project-1' },
          }),
        },
        fileProcessingJob: { findMany: jest.fn().mockResolvedValue([]) },
      } as unknown as PrismaService;
      const storage = {
        getPresignedUrlFrom: jest.fn().mockResolvedValue('https://files.test/signed-office'),
      } as unknown as FileStorageService;
      const service = new UnifiedFileService(
        prisma,
        storage,
        projectAccess,
        reviewConfiguration,
        reviewTasks,
        operationLog,
      );

      const session = await service.createPreviewSession('logical-office', {
        sub: 'user-1',
        username: 'reviewer',
        realName: '审核人',
        email: null,
        roles: [],
        permissions: ['file:preview'],
        permissionVersion: 1,
      });
      const onlyOffice = session.onlyOffice;
      const config = onlyOffice?.config as
        | {
            token?: string;
            document: {
              url: string;
              permissions: {
                edit: boolean;
                comment: boolean;
                review: boolean;
                download: boolean;
                print: boolean;
              };
            };
            editorConfig: { mode: string };
          }
        | undefined;

      expect(session.viewerType).toBe('ONLYOFFICE_VIEW');
      expect(session.downloadAllowed).toBe(false);
      expect(onlyOffice).toEqual(
        expect.objectContaining({ available: true, docsUrl: 'https://office.test' }),
      );
      expect(config).toEqual(
        expect.objectContaining({
          document: expect.objectContaining({
            url: 'https://files.test/signed-office',
            permissions: expect.objectContaining({
              edit: false,
              comment: false,
              review: false,
              download: false,
              print: false,
            }),
          }),
          editorConfig: expect.objectContaining({ mode: 'view' }),
        }),
      );

      const [header, body, signature] = config?.token?.split('.') ?? [];
      expect(header).toBeTruthy();
      expect(body).toBeTruthy();
      expect(signature).toBe(
        createHmac('sha256', 'onlyoffice-test-secret')
          .update(`${header}.${body}`)
          .digest('base64url'),
      );

      delete process.env.ONLYOFFICE_JWT_SECRET;
      const unsignedSession = await service.createPreviewSession('logical-office', {
        sub: 'user-1',
        username: 'reviewer',
        realName: '审核人',
        email: null,
        roles: [],
        permissions: ['file:preview'],
        permissionVersion: 1,
      });
      expect(unsignedSession.onlyOffice).toEqual(
        expect.objectContaining({
          available: false,
          reason: expect.stringContaining('禁止创建未签名预览会话'),
        }),
      );
      expect(unsignedSession.onlyOffice).not.toHaveProperty('config');
    } finally {
      if (previousDocsUrl === undefined) delete process.env.ONLYOFFICE_DOCS_URL;
      else process.env.ONLYOFFICE_DOCS_URL = previousDocsUrl;
      if (previousJwtSecret === undefined) delete process.env.ONLYOFFICE_JWT_SECRET;
      else process.env.ONLYOFFICE_JWT_SECRET = previousJwtSecret;
    }
  });

  it('downloads the explicitly requested review version instead of the approved current version', async () => {
    const currentVersion = {
      id: 'version-approved',
      version: 'V1.0',
      status: 'APPROVED',
      uploadedBy: 'owner-1',
      reviewTasks: [],
      asset: {
        id: 'asset-approved',
        originalName: 'approved.pdf',
        extension: 'pdf',
        mimeType: 'application/pdf',
        size: BigInt(128),
        checksum: 'approved',
        storageBucket: 'delivery-platform',
        storageKey: 'approved.pdf',
      },
    };
    const pendingVersion = {
      id: 'version-pending',
      version: 'V1.1',
      status: 'UPLOADED',
      uploadedBy: 'owner-1',
      reviewTasks: [
        {
          submittedBy: 'owner-1',
          steps: [{ assignees: [{ assigneeUserId: 'reviewer-1' }] }],
        },
      ],
      asset: {
        id: 'asset-pending',
        originalName: 'pending.pdf',
        extension: 'pdf',
        mimeType: 'application/pdf',
        size: BigInt(256),
        checksum: 'pending',
        storageBucket: 'delivery-platform',
        storageKey: 'pending.pdf',
      },
    };
    const prisma = {
      logicalFile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'logical-1',
          ownerType: 'PROJECT_ARCHIVE',
          ownerId: 'archive-entry-1',
          createdBy: 'owner-1',
          currentVersionId: currentVersion.id,
          currentVersion,
          versions: [currentVersion, pendingVersion],
          projectArchiveFile: { projectId: 'project-1' },
        }),
      },
    } as unknown as PrismaService;
    const storage = {
      getObjectFrom: jest.fn().mockResolvedValue(Readable.from('pending bytes')),
    } as unknown as FileStorageService;
    const service = new UnifiedFileService(
      prisma,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    const result = await service.download('version-pending', {
      sub: 'reviewer-1',
      permissions: ['file:download', 'file_review:act'],
      roles: [],
    });

    expect(storage.getObjectFrom).toHaveBeenCalledWith('delivery-platform', 'pending.pdf');
    expect(result.fileName).toBe('pending.pdf');
    expect(operationLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'download',
        afterData: { fileVersionId: 'version-pending' },
      }),
    );
  });

  it('does not label CAD as converted while its processing job is still pending', async () => {
    const prisma = {
      logicalFile: { findFirst: jest.fn().mockResolvedValue(previewLogicalFile('dwg')) },
      fileProcessingJob: {
        findMany: jest
          .fn()
          .mockResolvedValue([previewJob({ type: 'CAD_CONVERT', status: 'PENDING', progress: 0 })]),
      },
    } as unknown as PrismaService;
    const storage = {
      getPresignedUrlFrom: jest.fn().mockResolvedValue('https://files.test/original.dwg'),
    } as unknown as FileStorageService;
    const service = new UnifiedFileService(
      prisma,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    const session = await service.createPreviewSession('logical-preview', previewActor());

    expect(session).toEqual(
      expect.objectContaining({
        viewerType: 'UNSUPPORTED',
        availability: expect.objectContaining({
          state: 'PROCESSING',
          errorCode: 'FILE_PREVIEW_PROCESSING',
        }),
      }),
    );
  });

  it('uses the completed CAD conversion asset instead of the source object', async () => {
    const outputAsset = {
      ...previewLogicalFile('pdf').currentVersion.asset,
      id: 'asset-output',
      originalName: 'drawing-cad-preview.pdf',
      storageKey: 'processed/drawing.pdf',
    };
    const prisma = {
      logicalFile: { findFirst: jest.fn().mockResolvedValue(previewLogicalFile('dwg')) },
      fileProcessingJob: {
        findMany: jest.fn().mockResolvedValue([
          previewJob({
            type: 'CAD_CONVERT',
            status: 'COMPLETED',
            progress: 100,
            outputAsset,
          }),
        ]),
      },
    } as unknown as PrismaService;
    const storage = {
      getPresignedUrlFrom: jest.fn().mockResolvedValue('https://files.test/processed.pdf'),
    } as unknown as FileStorageService;
    const service = new UnifiedFileService(
      prisma,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    const session = await service.createPreviewSession('logical-preview', previewActor());

    expect(session).toEqual(
      expect.objectContaining({
        viewerType: 'CAD_CONVERTED',
        previewUrl: 'https://files.test/processed.pdf',
        availability: { state: 'READY' },
      }),
    );
    expect(storage.getPresignedUrlFrom).toHaveBeenCalledWith(
      'delivery-platform',
      'processed/drawing.pdf',
      300,
    );
  });

  it('returns the parsed XMind outline only after the processing output is complete', async () => {
    const outputAsset = {
      ...previewLogicalFile('json').currentVersion.asset,
      id: 'asset-output',
      originalName: 'plan-outline.json',
      mimeType: 'application/json',
      storageKey: 'processed/plan-outline.json',
    };
    const prisma = {
      logicalFile: { findFirst: jest.fn().mockResolvedValue(previewLogicalFile('xmind')) },
      fileProcessingJob: {
        findMany: jest.fn().mockResolvedValue([
          previewJob({
            type: 'XMIND_PARSE',
            status: 'COMPLETED',
            progress: 100,
            outputAsset,
          }),
        ]),
      },
    } as unknown as PrismaService;
    const outline = {
      version: 1,
      sheets: [{ title: '计划', root: { title: '交付', children: [] } }],
    };
    const storage = {
      getObjectFrom: jest
        .fn()
        .mockResolvedValue(Readable.from(Buffer.from(JSON.stringify(outline)))),
      getPresignedUrlFrom: jest.fn().mockResolvedValue('https://files.test/outline.json'),
    } as unknown as FileStorageService;
    const service = new UnifiedFileService(
      prisma,
      storage,
      projectAccess,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    const session = await service.createPreviewSession('logical-preview', previewActor());

    expect(session).toEqual(
      expect.objectContaining({
        viewerType: 'XMIND',
        availability: { state: 'READY' },
        xmind: { sheets: outline.sheets },
      }),
    );
  });

  function pdfFile(originalname = 'drawing.pdf'): Express.Multer.File {
    const buffer = Buffer.from('%PDF-1.7\nmock');
    return {
      fieldname: 'file',
      originalname,
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: buffer.length,
      destination: '',
      filename: '',
      path: '',
      buffer,
      stream: Readable.from(buffer),
    };
  }

  function previewLogicalFile(extension: string) {
    const mimeType =
      extension === 'pdf'
        ? 'application/pdf'
        : extension === 'json'
          ? 'application/json'
          : 'application/octet-stream';
    const asset = {
      id: 'asset-source',
      ownerType: 'PROJECT_ARCHIVE',
      ownerId: 'entry-1',
      originalName: `drawing.${extension}`,
      extension,
      mimeType,
      size: BigInt(1024),
      storageProvider: 'minio',
      storageBucket: 'delivery-platform',
      storageKey: `source/drawing.${extension}`,
      checksum: 'checksum',
      status: 'AVAILABLE',
      createdBy: 'user-1',
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const version = {
      id: 'version-preview',
      version: 'V1.0',
      status: 'APPROVED',
      uploadedBy: 'user-1',
      reviewTasks: [],
      asset,
    };
    return {
      id: 'logical-preview',
      ownerType: 'PROJECT_ARCHIVE',
      ownerId: 'entry-1',
      currentVersionId: version.id,
      currentVersion: version,
      versions: [version],
      projectArchiveFile: { projectId: 'project-1' },
    };
  }

  function businessLogicalFile(ownerType: 'STANDARD' | 'KNOWLEDGE', ownerId: string) {
    return {
      ...previewLogicalFile('pdf'),
      ownerType,
      ownerId,
      createdBy: 'creator-1',
      projectArchiveFile: null,
    };
  }

  function previewJob(overrides: Record<string, unknown>) {
    return {
      id: 'job-preview',
      type: 'CAD_CONVERT',
      status: 'PENDING',
      progress: 0,
      attempts: 0,
      availableAt: new Date(),
      errorCode: null,
      errorMessage: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      outputAsset: null,
      ...overrides,
    };
  }

  function previewActor() {
    return {
      sub: 'user-1',
      username: 'user',
      realName: '测试用户',
      email: null,
      roles: [],
      permissions: ['file:preview'],
      permissionVersion: 1,
    };
  }

  function fileActor(permissions: string[], sub = 'user-1') {
    return { sub, permissions, roles: [] as string[] };
  }

  function idempotentVersion(
    file: Express.Multer.File,
    owner: {
      ownerType: string;
      ownerId: string;
      projectId?: string;
      archiveItemId?: string;
    },
  ) {
    return {
      id: 'version-idempotent',
      logicalFileId: 'logical-idempotent',
      revisionLevel: 'MINOR',
      changeDescription: null,
      uploadedBy: 'user-1',
      status: owner.ownerType === 'PROJECT_ARCHIVE' ? 'APPROVED' : 'DRAFT',
      archivedAt: null,
      asset: {
        originalName: file.originalname,
        extension: 'pdf',
        mimeType: file.mimetype,
        size: BigInt(file.size),
        checksum: createHash('sha256').update(file.buffer).digest('hex'),
        archivedAt: null,
      },
      logicalFile: {
        id: 'logical-idempotent',
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        archivedAt: null,
        projectArchiveFile: owner.projectId
          ? {
              projectId: owner.projectId,
              archiveItemId: owner.archiveItemId,
              archivedAt: null,
            }
          : null,
      },
    };
  }
});
