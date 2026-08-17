import { BadRequestException, ConflictException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import type { OperationLogService } from '../../operation-log/operation-log.service';
import { ArchiveTemplateVersionService } from '../archive-template-version.service';

describe('ArchiveTemplateVersionService', () => {
  const operationLog = {
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as OperationLogService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clones the current published two-level snapshot into a new draft', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      archiveTemplate: {
        update: jest.fn().mockResolvedValue({ id: 'template-1', status: 'DRAFT' }),
      },
      archiveTemplateVersion: {
        create: jest.fn().mockResolvedValue({ id: 'version-new' }),
      },
      archiveTemplateFolder: {
        create: jest.fn().mockResolvedValue({ id: 'folder-new' }),
      },
      archiveTemplateVersionItem: { createMany },
    };
    const archiveTemplateVersionFindUnique = jest
      .fn()
      .mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        if ('templateId_versionNo' in where) return Promise.resolve(null);
        return Promise.resolve({ id: 'version-new', folders: [], template: {} });
      });
    const prisma = {
      archiveTemplate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'template-1',
          status: 'PUBLISHED',
          currentPublishedVersionId: 'version-1',
        }),
      },
      archiveTemplateVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'version-1',
          folders: [
            {
              stableKey: 'design',
              name: '设计文件',
              description: null,
              sortOrder: 1,
              items: [
                {
                  stableKey: 'design-drawing',
                  name: '设计图纸',
                  description: null,
                  required: true,
                  reviewRequired: true,
                  approvalTemplateId: null,
                  ownerRoleId: null,
                  allowMultipleFiles: false,
                  allowedExtensions: ['pdf'],
                  maxFileSize: BigInt(10),
                  namingRule: null,
                  sortOrder: 1,
                },
              ],
            },
          ],
        }),
        findUnique: archiveTemplateVersionFindUnique,
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new ArchiveTemplateVersionService(prisma, operationLog);

    await service.createVersion('template-1', { versionNo: 'V1.1' }, 'user-1');

    expect(transaction.archiveTemplate.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: { status: 'DRAFT', updatedBy: 'user-1' },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          templateVersionId: 'version-new',
          folderId: 'folder-new',
          stableKey: 'design-drawing',
        }),
      ],
    });
  });

  it('keeps a published version immutable', async () => {
    const prisma = {
      archiveTemplateVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          templateId: 'template-1',
          versionNo: 'V1.0',
          status: 'PUBLISHED',
          revision: 1,
        }),
      },
    } as unknown as PrismaService;
    const service = new ArchiveTemplateVersionService(prisma, operationLog);

    await expect(
      service.replaceDraftStructure('version-1', { revision: 1, folders: [] }, 'user-1'),
    ).rejects.toThrow(new BadRequestException('只有草稿或已驳回版本可以修改'));
  });

  it('rejects duplicate item stable keys across different folders', async () => {
    const prisma = {
      archiveTemplateVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          templateId: 'template-1',
          versionNo: 'V1.0',
          status: 'DRAFT',
          revision: 1,
        }),
      },
    } as unknown as PrismaService;
    const service = new ArchiveTemplateVersionService(prisma, operationLog);

    await expect(
      service.replaceDraftStructure(
        'version-1',
        {
          revision: 1,
          folders: [
            {
              stableKey: 'folder-a',
              name: 'A',
              items: [{ stableKey: 'shared', name: 'A1' }],
            },
            {
              stableKey: 'folder-b',
              name: 'B',
              items: [{ stableKey: 'shared', name: 'B1' }],
            },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow(new BadRequestException('文件项稳定标识重复：shared'));
  });

  it('will not publish an empty draft', async () => {
    const prisma = {
      archiveTemplateVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          status: 'DRAFT',
          revision: 1,
          template: { id: 'template-1', status: 'DRAFT' },
          _count: { folders: 0, versionItems: 0 },
        }),
      },
    } as unknown as PrismaService;
    const service = new ArchiveTemplateVersionService(prisma, operationLog);

    await expect(service.publishVersion('version-1', 'user-1')).rejects.toThrow(
      new BadRequestException('档案模板版本至少需要一个文件夹和一个文件项'),
    );
  });

  it('publishes a draft directly without creating a review task', async () => {
    const transaction = {
      archiveTemplateVersion: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      archiveTemplate: { update: jest.fn().mockResolvedValue({ id: 'template-1' }) },
      reviewTask: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
    };
    const prisma = {
      archiveTemplateVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          templateId: 'template-1',
          versionNo: 'V1.0',
          status: 'DRAFT',
          revision: 4,
          template: { id: 'template-1', status: 'DRAFT' },
          _count: { folders: 1, versionItems: 1 },
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new ArchiveTemplateVersionService(prisma, operationLog);
    jest.spyOn(service, 'findVersion').mockResolvedValue({
      id: 'version-1',
      status: 'PUBLISHED',
    } as never);

    await expect(service.publishVersion('version-1', 'user-1')).resolves.toEqual({
      id: 'version-1',
      status: 'PUBLISHED',
    });

    expect(transaction.reviewTask.updateMany).not.toHaveBeenCalled();
    expect(transaction.archiveTemplateVersion.updateMany).toHaveBeenCalledWith({
      where: { id: 'version-1', status: 'DRAFT', revision: 4 },
      data: expect.objectContaining({
        status: 'PUBLISHED',
        revision: { increment: 1 },
        publishedBy: 'user-1',
        publishedAt: expect.any(Date),
      }),
    });
    expect(transaction.archiveTemplate.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: {
        currentPublishedVersionId: 'version-1',
        status: 'PUBLISHED',
        updatedBy: 'user-1',
      },
    });
    expect(transaction.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'ArchiveTemplatePublished',
        aggregateId: 'version-1',
        deduplicationKey: 'ArchiveTemplatePublished:version-1',
      }),
    });
    expect(operationLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'publish_version',
        targetId: 'version-1',
      }),
    );
  });

  it('archives a legacy pending review task before directly publishing an in-review version', async () => {
    const transaction = {
      archiveTemplateVersion: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      archiveTemplate: { update: jest.fn().mockResolvedValue({ id: 'template-1' }) },
      reviewTask: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
    };
    const prisma = {
      archiveTemplateVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-review',
          templateId: 'template-1',
          versionNo: 'V2.0',
          status: 'IN_REVIEW',
          revision: 8,
          template: { id: 'template-1', status: 'IN_REVIEW' },
          _count: { folders: 2, versionItems: 4 },
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new ArchiveTemplateVersionService(prisma, operationLog);
    jest.spyOn(service, 'findVersion').mockResolvedValue({ id: 'version-review' } as never);

    await service.publishVersion('version-review', 'user-1');

    expect(transaction.reviewTask.updateMany).toHaveBeenCalledWith({
      where: {
        sourceType: 'ARCHIVE_TEMPLATE',
        sourceId: 'version-review',
        sourceVersionId: 'version-review',
        status: 'PENDING',
        archivedAt: null,
      },
      data: { archivedAt: expect.any(Date), activeReviewKey: null },
    });
  });

  it('fails atomically when another request changes the version before publication', async () => {
    const transaction = {
      archiveTemplateVersion: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      archiveTemplate: { update: jest.fn() },
      reviewTask: { updateMany: jest.fn() },
      outboxEvent: { create: jest.fn() },
    };
    const prisma = {
      archiveTemplateVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          versionNo: 'V1.0',
          status: 'DRAFT',
          revision: 2,
          template: { id: 'template-1', status: 'DRAFT' },
          _count: { folders: 1, versionItems: 1 },
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new ArchiveTemplateVersionService(prisma, operationLog);

    await expect(service.publishVersion('version-1', 'user-1')).rejects.toThrow(
      new ConflictException('档案模板版本状态已变化，请刷新后重试'),
    );
    expect(transaction.archiveTemplate.update).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.create).not.toHaveBeenCalled();
  });
});
