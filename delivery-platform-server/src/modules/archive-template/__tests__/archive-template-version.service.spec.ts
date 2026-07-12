import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import type { OperationLogService } from '../../operation-log/operation-log.service';
import type { ReviewConfigurationService } from '../../review/review-configuration.service';
import type { ReviewTaskService } from '../../review/review-task.service';
import { ArchiveTemplateVersionService } from '../archive-template-version.service';

describe('ArchiveTemplateVersionService', () => {
  const reviewConfiguration = {
    resolve: jest.fn(),
  } as unknown as ReviewConfigurationService;
  const reviewTasks = {
    createTask: jest.fn(),
    approve: jest.fn(),
  } as unknown as ReviewTaskService;
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
    const service = new ArchiveTemplateVersionService(
      prisma,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

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
    const service = new ArchiveTemplateVersionService(
      prisma,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

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
    const service = new ArchiveTemplateVersionService(
      prisma,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

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

  it('will not submit an empty draft for approval', async () => {
    const prisma = {
      archiveTemplateVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          status: 'DRAFT',
          versionNo: 'V1.0',
          template: { templateName: '默认模板', countryCode: null },
          _count: { folders: 0, versionItems: 0 },
        }),
      },
    } as unknown as PrismaService;
    const service = new ArchiveTemplateVersionService(
      prisma,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    await expect(service.submitReview('version-1', {}, 'user-1')).rejects.toThrow(
      new BadRequestException('档案模板版本至少需要一个文件夹和一个文件项'),
    );
    expect(reviewTasks.createTask).not.toHaveBeenCalled();
  });

  it('publishes only by approving the linked unified review task', async () => {
    const prisma = {
      archiveTemplateVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          status: 'IN_REVIEW',
          _count: { folders: 1, versionItems: 1 },
        }),
      },
      reviewTask: {
        findFirst: jest.fn().mockResolvedValue({ id: 'review-task-1' }),
      },
    } as unknown as PrismaService;
    const service = new ArchiveTemplateVersionService(
      prisma,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );
    const actor = {
      sub: 'reviewer-1',
      username: 'reviewer',
      realName: '审核人',
      email: null,
      roles: [],
      permissions: ['file_review:act'],
      permissionVersion: 1,
    };
    (reviewTasks.approve as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(service, 'findVersion').mockResolvedValue({ id: 'version-1' } as never);

    await service.approveAssignedReviewStep('version-1', actor);

    expect(reviewTasks.approve).toHaveBeenCalledWith(
      'review-task-1',
      '档案模板版本审核通过',
      actor,
    );
  });

  it('fails closed when an in-review version has no unified review task', async () => {
    const prisma = {
      archiveTemplateVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          status: 'IN_REVIEW',
          _count: { folders: 1, versionItems: 1 },
        }),
      },
      reviewTask: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new ArchiveTemplateVersionService(
      prisma,
      reviewConfiguration,
      reviewTasks,
      operationLog,
    );

    await expect(
      service.approveAssignedReviewStep('version-1', {
        sub: 'reviewer-1',
        username: 'reviewer',
        realName: '审核人',
        email: null,
        roles: [],
        permissions: ['file_review:act'],
        permissionVersion: 1,
      }),
    ).rejects.toThrow('缺少统一审核任务');
    expect(reviewTasks.approve).not.toHaveBeenCalled();
  });
});
