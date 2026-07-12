import { UnprocessableEntityException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import type { ReviewConfigurationService } from '../../review/review-configuration.service';
import type { ReviewTaskService } from '../../review/review-task.service';
import { KnowledgeItemService } from '../knowledge-item.service';

describe('KnowledgeItemService', () => {
  const owner = { sub: 'user-1', permissions: ['knowledge:update_draft'] };
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

  it('enforces mutually exclusive FILE, MARKDOWN and LINK primary content', async () => {
    const prisma = {
      knowledgeCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: 'category-1' }),
      },
    } as unknown as PrismaService;
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);

    await expect(
      service.create(
        {
          title: '操作指引',
          categoryId: 'category-1',
          contentType: 'FILE',
          fileVersionId: '61f393a7-f0c0-4bf0-92e8-17482d8d7076',
          markdownContent: '# 重复主内容',
        },
        owner,
      ),
    ).rejects.toThrow(
      new UnprocessableEntityException('FILE、MARKDOWN、LINK 内容必须且只能填写对应的一种主内容'),
    );
  });

  it('preserves supporting file versions when deriving a new draft', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const transaction = {
      knowledgeVersion: {
        create: jest.fn().mockResolvedValue({
          id: 'version-2',
          version: 'V1.1',
          status: 'DRAFT',
        }),
      },
      knowledgeVersionFile: { createMany },
      fileVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'support-1',
            assetId: 'asset-1',
            logicalFile: {
              id: 'logical-1',
              ownerType: 'KNOWLEDGE',
              ownerId: 'knowledge-1',
              archivedAt: null,
            },
          },
          {
            id: 'support-2',
            assetId: 'asset-2',
            logicalFile: {
              id: 'logical-2',
              ownerType: 'KNOWLEDGE',
              ownerId: 'knowledge-1',
              archivedAt: null,
            },
          },
        ]),
      },
      logicalFile: { update: jest.fn() },
      fileAsset: { update: jest.fn() },
      knowledgeItem: { update: jest.fn() },
    };
    const prisma = {
      knowledgeItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'knowledge-1',
          status: 'PUBLISHED',
          createdBy: 'user-1',
          currentPublishedVersionId: 'version-1',
        }),
      },
      knowledgeVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'version-1',
            contentType: 'MARKDOWN',
            fileVersionId: null,
            markdownContent: '# 指引',
            externalUrl: null,
            supportingFiles: [
              { fileVersionId: 'support-1', role: 'SUPPORTING', sortOrder: 0 },
              { fileVersionId: 'support-2', role: 'SUPPORTING', sortOrder: 1 },
            ],
          })
          .mockResolvedValueOnce(null),
        findMany: jest.fn().mockResolvedValue([{ version: 'V1.0' }]),
      },
      fileVersion: { count: jest.fn().mockResolvedValue(2) },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);

    await service.createVersion('knowledge-1', {}, owner);

    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          knowledgeVersionId: 'version-2',
          fileVersionId: 'support-1',
          role: 'SUPPORTING',
          sortOrder: 0,
        },
        {
          knowledgeVersionId: 'version-2',
          fileVersionId: 'support-2',
          role: 'SUPPORTING',
          sortOrder: 1,
        },
      ],
    });
  });

  it('submits a knowledge version through the unified review services', async () => {
    const prisma = {
      knowledgeVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          version: 'V1.0',
          status: 'DRAFT',
          contentType: 'MARKDOWN',
          fileVersionId: null,
          markdownContent: '# 指引',
          externalUrl: null,
          archivedAt: null,
          supportingFiles: [],
          knowledgeItem: {
            id: 'knowledge-1',
            title: '操作指引',
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
    createReviewTask.mockResolvedValue({ id: 'task-1' });
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);

    await service.submitReview('version-1', { approvalTemplateId: 'template-1' }, owner);

    expect(createReviewTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'KNOWLEDGE',
        sourceId: 'version-1',
        sourceVersionId: 'version-1',
        submittedBy: 'user-1',
      }),
    );
  });

  it('does not expose draft versions through a published master record', async () => {
    const versionFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      reviewTask: { findMany: jest.fn().mockResolvedValue([]) },
      knowledgeItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'knowledge-1',
          title: '公开知识',
          categoryId: 'category-1',
          summary: null,
          contentType: 'MARKDOWN',
          status: 'PUBLISHED',
          currentPublishedVersionId: 'version-1',
          effectiveAt: null,
          createdBy: 'owner-1',
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { id: 'category-1', name: '交付' },
          creator: { id: 'owner-1', realName: '作者' },
        }),
      },
      knowledgeVersion: { findMany: versionFindMany },
    } as unknown as PrismaService;
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);

    await service.findById('knowledge-1', {
      sub: 'reader-1',
      permissions: ['knowledge:view'],
    });

    expect(versionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          knowledgeItemId: 'knowledge-1',
          OR: [{ status: 'PUBLISHED' }],
        },
      }),
    );
  });
});
