import { UnprocessableEntityException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import type { ReviewConfigurationService } from '../../review/review-configuration.service';
import type { ReviewTaskService } from '../../review/review-task.service';
import { StandardService } from '../standard.service';

describe('StandardService', () => {
  const owner = { sub: 'user-1', permissions: ['standard:update_draft'] };
  const reviewConfiguration = {
    resolve: jest.fn(),
  } as unknown as ReviewConfigurationService;
  const createReviewTask = jest.fn();
  const reviewTasks = {
    createTask: createReviewTask,
  } as unknown as ReviewTaskService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a new standard without a file version', async () => {
    const prisma = {
      standard: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    await expect(
      service.create({ code: 'SOP-001', name: '交付规范', type: 'SOP', fileVersionId: '' }, owner),
    ).rejects.toThrow(new UnprocessableEntityException('标准版本必须关联有效文件版本'));
  });

  it('requires an active MinIO-backed file version before creating a standard', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const transaction = jest.fn();
    const prisma = {
      standard: { findFirst: jest.fn().mockResolvedValue(null) },
      fileVersion: { count },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    await expect(
      service.create(
        {
          code: 'SOP-001',
          name: '交付规范',
          type: 'SOP',
          fileVersionId: 'file-version-1',
        },
        owner,
      ),
    ).rejects.toThrow('文件版本不存在、不可用、已归档或当前用户无权引用');
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { in: ['file-version-1'] },
        archivedAt: null,
        logicalFile: { archivedAt: null },
        asset: {
          archivedAt: null,
          status: 'AVAILABLE',
          storageProvider: 'minio',
          checksum: { not: null },
        },
      }),
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('creates the initial version with one bound file and no legacy content fields', async () => {
    const versionCreate = jest.fn().mockResolvedValue({ id: 'version-1' });
    const logicalFileUpdate = jest.fn().mockResolvedValue({ id: 'logical-file-1' });
    const fileAssetUpdate = jest.fn().mockResolvedValue({ id: 'asset-1' });
    const transaction = {
      standard: {
        create: jest.fn().mockResolvedValue({ id: 'standard-1' }),
      },
      standardVersion: { create: versionCreate },
      fileVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'file-version-1',
            assetId: 'asset-1',
            logicalFile: {
              id: 'logical-file-1',
              ownerType: 'STANDARD_DRAFT',
              ownerId: 'user-1',
              archivedAt: null,
            },
          },
        ]),
      },
      logicalFile: { update: logicalFileUpdate },
      fileAsset: { update: fileAssetUpdate },
    };
    const prisma = {
      reviewTask: { findMany: jest.fn().mockResolvedValue([]) },
      standard: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(standardRecord({ createdBy: 'user-1' })),
      },
      standardVersion: {
        findMany: jest.fn().mockResolvedValue([standardVersionRecord({ submittedBy: 'user-1' })]),
      },
      fileVersion: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    const result = await service.create(
      {
        code: 'SOP-001',
        name: '交付规范',
        type: 'SOP',
        fileVersionId: 'file-version-1',
      },
      owner,
    );

    expect(versionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        standardId: 'standard-1',
        fileVersionId: 'file-version-1',
        status: 'DRAFT',
      }),
    });
    const createData = versionCreate.mock.calls[0]?.[0]?.data;
    expect(createData).not.toHaveProperty('structuredContent');
    expect(createData).not.toHaveProperty('applicability');
    expect(logicalFileUpdate).toHaveBeenCalledWith({
      where: { id: 'logical-file-1' },
      data: { ownerType: 'STANDARD', ownerId: 'standard-1' },
    });
    expect(fileAssetUpdate).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: { ownerType: 'STANDARD', ownerId: 'standard-1' },
    });
    expect(result).not.toHaveProperty('versions.0.structuredContent');
    expect(result).not.toHaveProperty('versions.0.applicability');
  });

  it('creates a new draft by copying the published version instead of editing it', async () => {
    const fileVersionCount = jest.fn().mockResolvedValue(1);
    const create = jest.fn().mockResolvedValue(
      standardVersionRecord({
        id: 'version-2',
        status: 'DRAFT',
        version: 'V1.1',
        legacySnapshot: { private: true },
      }),
    );
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'standard-1', archived_at: null }]),
      standard: {
        findUnique: jest.fn().mockResolvedValue({ currentPublishedVersionId: 'version-1' }),
        update: jest.fn().mockResolvedValue({ id: 'standard-1' }),
      },
      standardVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ version: 'V1.0' }]),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ fileVersionId: 'file-version-1', effectiveAt: null })
          .mockResolvedValueOnce(null),
        create,
      },
      fileVersion: {
        count: fileVersionCount,
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'file-version-1',
            assetId: 'asset-1',
            logicalFile: {
              id: 'logical-file-1',
              ownerType: 'STANDARD',
              ownerId: 'standard-1',
              archivedAt: null,
            },
          },
        ]),
      },
    };
    const prisma = {
      standard: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'standard-1',
          code: 'SOP-001',
          status: 'PUBLISHED',
          createdBy: 'user-1',
          currentPublishedVersionId: 'version-1',
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    const result = await service.createVersion('standard-1', {}, owner);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          standardId: 'standard-1',
          version: 'V1.1',
          status: 'DRAFT',
          fileVersionId: 'file-version-1',
        }),
      }),
    );
    const createData = create.mock.calls[0]?.[0]?.data;
    expect(createData).not.toHaveProperty('structuredContent');
    expect(createData).not.toHaveProperty('applicability');
    expect(fileVersionCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              logicalFile: {
                ownerType: 'STANDARD',
                ownerId: 'standard-1',
                archivedAt: null,
              },
            },
          ]),
        }),
      }),
    );
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRaw.mock.calls[0][0].strings.join('')).toContain('FROM standards');
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.standardVersion.findFirst.mock.invocationCallOrder[0],
    );
    expect(transaction.standardVersion.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.standard.findUnique.mock.invocationCallOrder[0],
    );
    expect(transaction.standard.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.standardVersion.findUnique.mock.invocationCallOrder[0],
    );
    expect(transaction.standardVersion.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0],
    );
    expect(result).not.toHaveProperty('legacySnapshot');
  });

  it('rejects a new version when neither an explicit nor published file exists', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'standard-1', archived_at: null }]),
      standard: {
        findUnique: jest.fn().mockResolvedValue({ currentPublishedVersionId: null }),
      },
      standardVersion: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      standard: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'standard-1',
          code: 'SOP-001',
          status: 'DRAFT',
          createdBy: 'user-1',
          currentPublishedVersionId: null,
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    await expect(service.createVersion('standard-1', {}, owner)).rejects.toThrow(
      new UnprocessableEntityException('标准版本必须关联有效文件版本'),
    );
  });

  it('replaces a draft file under revision CAS without writing legacy content', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const logicalFileUpdate = jest.fn().mockResolvedValue({ id: 'logical-file-2' });
    const transaction = {
      standardVersion: {
        updateMany,
        findUnique: jest.fn().mockResolvedValue(
          standardVersionRecord({
            id: 'version-2',
            revision: 5,
            fileVersionId: 'file-version-2',
            fileVersion: publicFileVersionWithInternalMetadata('replacement.pdf'),
          }),
        ),
      },
      fileVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'file-version-2',
            assetId: 'asset-2',
            logicalFile: {
              id: 'logical-file-2',
              ownerType: 'STANDARD_DRAFT',
              ownerId: 'user-1',
              archivedAt: null,
            },
          },
        ]),
      },
      logicalFile: { update: logicalFileUpdate },
      fileAsset: { update: jest.fn().mockResolvedValue({ id: 'asset-2' }) },
      standard: { update: jest.fn().mockResolvedValue({ id: 'standard-1' }) },
    };
    const prisma = {
      standardVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-2',
          version: 'V1.1',
          fileVersionId: 'file-version-1',
          status: 'DRAFT',
          revision: 4,
          effectiveAt: null,
          changeDescription: '旧说明',
          archivedAt: null,
          standard: { id: 'standard-1', createdBy: 'user-1', archivedAt: null },
        }),
      },
      fileVersion: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    const result = await service.updateVersion(
      'version-2',
      { revision: 4, fileVersionId: 'file-version-2', changeDescription: '替换文件' },
      owner,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'version-2', revision: 4 }),
        data: expect.objectContaining({
          revision: { increment: 1 },
          fileVersionId: 'file-version-2',
          changeDescription: '替换文件',
        }),
      }),
    );
    const updateData = updateMany.mock.calls[0]?.[0]?.data;
    expect(updateData).not.toHaveProperty('structuredContent');
    expect(updateData).not.toHaveProperty('applicability');
    expect(logicalFileUpdate).toHaveBeenCalledWith({
      where: { id: 'logical-file-2' },
      data: { ownerType: 'STANDARD', ownerId: 'standard-1' },
    });
    expect(result).toHaveProperty('fileVersionId', 'file-version-2');
  });

  it('keeps a published version immutable', async () => {
    const transaction = jest.fn();
    const prisma = {
      standardVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          status: 'PUBLISHED',
          archivedAt: null,
          standard: { id: 'standard-1', createdBy: 'user-1', archivedAt: null },
        }),
      },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    await expect(
      service.updateVersion('version-1', { revision: 1, fileVersionId: 'file-version-2' }, owner),
    ).rejects.toThrow('可编辑标准版本不存在');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('submits a standard version through the unified review services', async () => {
    const prisma = {
      standardVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          version: 'V1.0',
          status: 'DRAFT',
          revision: 3,
          fileVersionId: 'file-version-1',
          archivedAt: null,
          standard: {
            id: 'standard-1',
            code: 'SOP-001',
            name: '交付规范',
            createdBy: 'user-1',
            archivedAt: null,
          },
        }),
      },
    } as unknown as PrismaService;
    jest.spyOn(reviewConfiguration, 'resolve').mockResolvedValue({
      approvalTemplateId: 'template-1',
      approvalTemplateVersion: '2026-07-11T00:00:00.000Z',
      snapshot: { id: 'template-1' },
      reviewMode: 'SINGLE',
      steps: [{ mode: 'SINGLE', assigneeUserIds: ['reviewer-1'] }],
    });
    createReviewTask.mockResolvedValue({ id: 'task-1', status: 'PENDING' });
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    const result = await service.submitReview(
      'version-1',
      { approvalTemplateId: 'template-1', revision: 3 },
      owner,
    );

    expect(reviewConfiguration.resolve).toHaveBeenCalledWith('template-1', 'user-1');
    expect(createReviewTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'STANDARD',
        sourceId: 'version-1',
        sourceVersionId: 'version-1',
        sourceRevision: 3,
        fileVersionId: 'file-version-1',
        submittedBy: 'user-1',
      }),
    );
    expect(result).toEqual({ id: 'task-1', status: 'PENDING' });
  });

  it('rejects review submission when the file-only invariant is broken', async () => {
    const prisma = {
      standardVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          version: 'V1.0',
          status: 'DRAFT',
          revision: 1,
          fileVersionId: null,
          archivedAt: null,
          standard: {
            id: 'standard-1',
            code: 'SOP-001',
            name: '交付规范',
            createdBy: 'user-1',
            archivedAt: null,
          },
        }),
      },
    } as unknown as PrismaService;
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    await expect(service.submitReview('version-1', { revision: 1 }, owner)).rejects.toThrow(
      new UnprocessableEntityException('标准版本必须关联有效文件版本'),
    );
    expect(reviewConfiguration.resolve).not.toHaveBeenCalled();
    expect(createReviewTask).not.toHaveBeenCalled();
  });

  it('locks the aggregate before checking active reviews and archiving versions', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'standard-1', archived_at: null }]),
      standardVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ id: 'version-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      reviewTask: { findFirst: jest.fn().mockResolvedValue(null) },
      standard: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      operationLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    const result = await service.archive('standard-1', {
      sub: 'manager-1',
      permissions: ['standard:archive'],
    });

    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.standardVersion.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.reviewTask.findFirst).toHaveBeenCalledWith({
      where: {
        sourceType: 'STANDARD',
        status: 'PENDING',
        archivedAt: null,
        sourceVersionId: { in: ['version-1'] },
      },
      select: { id: true },
    });
    expect(tx.standard.updateMany).toHaveBeenCalledWith({
      where: { id: 'standard-1', archivedAt: null },
      data: expect.objectContaining({ status: 'ARCHIVED', updatedBy: 'manager-1' }),
    });
    expect(result).toEqual(expect.objectContaining({ id: 'standard-1', status: 'ARCHIVED' }));
  });

  it('never exposes legacy snapshots or file storage metadata in public detail responses', async () => {
    const versionFindMany = jest.fn().mockResolvedValue([
      standardVersionRecord({
        legacySnapshot: { internalWorkflow: 'legacy' },
        fileVersionId: 'file-version-1',
        fileVersion: publicFileVersionWithInternalMetadata('standard.pdf'),
      }),
    ]);
    const prisma = {
      reviewTask: { findMany: jest.fn().mockResolvedValue([]) },
      standard: {
        findFirst: jest.fn().mockResolvedValue(
          standardRecord({
            legacySnapshot: { internalMasterState: true },
          }),
        ),
      },
      standardVersion: { findMany: versionFindMany },
    } as unknown as PrismaService;
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    const result = await service.findById('standard-1', {
      sub: 'manager-1',
      permissions: ['standard:publish'],
    });

    expect(result).not.toHaveProperty('legacySnapshot');
    expect(result).not.toHaveProperty('versions.0.legacySnapshot');
    expect(result).not.toHaveProperty('versions.0.structuredContent');
    expect(result).not.toHaveProperty('versions.0.applicability');
    expect(result).not.toHaveProperty('versions.0.fileVersion.idempotencyKey');
    expect(result).not.toHaveProperty('versions.0.fileVersion.asset.storageBucket');
    expect(result).not.toHaveProperty('versions.0.fileVersion.asset.storageKey');
    expect(result).not.toHaveProperty('versions.0.fileVersion.asset.checksum');
    expect(result).toHaveProperty('versions.0.fileVersion.asset.originalName', 'standard.pdf');
    expect(versionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          fileVersion: expect.objectContaining({
            select: expect.objectContaining({
              asset: expect.objectContaining({
                select: expect.not.objectContaining({
                  storageBucket: true,
                  storageKey: true,
                  checksum: true,
                }),
              }),
            }),
          }),
        }),
      }),
    );
    expect(versionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          legacySnapshot: true,
          structuredContent: true,
          applicability: true,
        }),
      }),
    );
  });

  it('fails closed instead of returning a fileless legacy version', async () => {
    const prisma = {
      reviewTask: { findMany: jest.fn().mockResolvedValue([]) },
      standard: {
        findFirst: jest.fn().mockResolvedValue(standardRecord({ createdBy: 'user-1' })),
      },
      standardVersion: {
        findMany: jest
          .fn()
          .mockResolvedValue([standardVersionRecord({ fileVersionId: null, fileVersion: null })]),
      },
    } as unknown as PrismaService;
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    await expect(service.findById('standard-1', owner)).rejects.toThrow(
      new UnprocessableEntityException('标准版本文件关联缺失'),
    );
  });

  it('filters drafts to the creator or assigned reviewer at the database query', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      reviewTask: {
        findMany: jest.fn().mockResolvedValue([{ sourceVersionId: 'assigned-version' }]),
      },
      standard: {
        count: jest.fn().mockResolvedValue(0),
        findMany,
      },
    } as unknown as PrismaService;
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    await service.findAll({}, { sub: 'reviewer-1', permissions: ['standard:view'] });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { status: 'PUBLISHED' },
                { createdBy: 'reviewer-1' },
                {
                  versions: {
                    some: { id: { in: ['assigned-version'] } },
                  },
                },
              ],
            },
            { archivedAt: null },
          ],
        },
      }),
    );
  });
});

function standardRecord(overrides: Record<string, unknown> = {}) {
  const timestamp = new Date('2026-07-13T00:00:00.000Z');
  return {
    id: 'standard-1',
    code: 'SOP-001',
    name: '交付规范',
    type: 'SOP',
    category: null,
    status: 'DRAFT',
    currentPublishedVersionId: null,
    currentPublishedVersion: null,
    effectiveAt: null,
    createdBy: 'owner-1',
    updatedBy: 'owner-1',
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    creator: { id: 'owner-1', realName: '创建人' },
    updater: { id: 'owner-1', realName: '创建人' },
    ...overrides,
  };
}

function standardVersionRecord(overrides: Record<string, unknown> = {}) {
  const timestamp = new Date('2026-07-13T00:00:00.000Z');
  return {
    id: 'version-1',
    standardId: 'standard-1',
    version: 'V1.0',
    fileVersionId: 'file-version-1',
    fileVersion: publicFileVersionWithInternalMetadata('standard.pdf'),
    status: 'DRAFT',
    revision: 1,
    effectiveAt: null,
    changeDescription: null,
    submittedBy: 'owner-1',
    submitter: { id: 'owner-1', realName: '创建人' },
    publishedAt: null,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function publicFileVersionWithInternalMetadata(originalName: string) {
  return {
    id: 'file-version-1',
    logicalFileId: 'logical-file-1',
    version: 1,
    status: 'APPROVED',
    idempotencyKey: 'internal-idempotency-key',
    uploadedBy: 'owner-1',
    asset: {
      id: 'asset-1',
      originalName,
      extension: 'pdf',
      mimeType: 'application/pdf',
      size: BigInt(1024),
      storageBucket: 'private-bucket',
      storageKey: 'private/object-key.pdf',
      checksum: 'private-checksum',
    },
  };
}
