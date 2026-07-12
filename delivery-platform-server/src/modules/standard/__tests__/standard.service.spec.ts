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

  it('rejects a new standard without a file or structured content', async () => {
    const prisma = {
      standard: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    await expect(
      service.create({ code: 'SOP-001', name: '交付规范', type: 'SOP' }, owner),
    ).rejects.toThrow(new UnprocessableEntityException('标准版本必须包含文件版本或结构化内容'));
  });

  it('creates a new draft by copying the published version instead of editing it', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'version-2',
      status: 'DRAFT',
      version: 'V1.1',
    });
    const transaction = {
      standardVersion: { create },
      standard: { update: jest.fn().mockResolvedValue({ id: 'standard-1' }) },
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
      standardVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            fileVersionId: null,
            structuredContent: { steps: ['deliver'] },
            applicability: { country: 'CN' },
            effectiveAt: null,
          })
          .mockResolvedValueOnce(null),
        findMany: jest.fn().mockResolvedValue([{ version: 'V1.0' }]),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    await service.createVersion('standard-1', {}, owner);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        standardId: 'standard-1',
        version: 'V1.1',
        status: 'DRAFT',
        structuredContent: { steps: ['deliver'] },
        applicability: { country: 'CN' },
      }),
    });
  });

  it('submits a standard version through the unified review services', async () => {
    const prisma = {
      standardVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          version: 'V1.0',
          status: 'DRAFT',
          fileVersionId: null,
          structuredContent: { steps: [] },
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
    createReviewTask.mockResolvedValue({ id: 'task-1' });
    const service = new StandardService(prisma, reviewConfiguration, reviewTasks);

    await service.submitReview('version-1', { approvalTemplateId: 'template-1' }, owner);

    expect(reviewConfiguration.resolve).toHaveBeenCalledWith('template-1', 'user-1');
    expect(createReviewTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'STANDARD',
        sourceId: 'version-1',
        sourceVersionId: 'version-1',
        submittedBy: 'user-1',
      }),
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
