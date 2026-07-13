import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import type { DataScopeService } from '../../identity/data-scope/data-scope.service';
import type { OperationLogService } from '../../operation-log/operation-log.service';
import type { SystemConfigService } from '../../system-config/system-config.service';
import type { ReviewBusinessService } from '../review-business.service';
import { ReviewTaskService } from '../review-task.service';
import type { ReviewerEligibilityService } from '../reviewer-eligibility.service';

describe('ReviewTaskService', () => {
  const dataScope = {
    buildProjectWhere: jest.fn().mockResolvedValue({ id: { in: ['project-1'] } }),
  } as unknown as DataScopeService;
  const reviewerEligibility = {
    assertEligibleForReview: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReviewerEligibilityService;
  const operationLog = {
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as OperationLogService;
  const systemConfig = {
    getSettings: jest.fn().mockResolvedValue({ approval: { timeoutDays: 3 } }),
  } as unknown as SystemConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a task with resolved assignees and an immutable configuration snapshot', async () => {
    const business = {
      assertSupported: jest.fn(),
      applySubmission: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReviewBusinessService;
    const transaction = {
      reviewTask: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'task-1' }),
      },
      reviewStep: {
        create: jest.fn().mockResolvedValue({ id: 'step-1' }),
      },
      reviewAssignee: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      reviewActionEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) },
    };
    const prisma = {
      reviewTask: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 'task-1' }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new ReviewTaskService(
      prisma,
      dataScope,
      reviewerEligibility,
      business,
      operationLog,
      systemConfig,
    );

    await service.createTask({
      sourceType: 'PROJECT_ARCHIVE',
      sourceId: 'archive-file-1',
      sourceVersionId: 'version-1',
      sourceRevision: 7,
      projectId: 'project-1',
      fileVersionId: 'version-1',
      title: '设计图纸 V1.0',
      locationLabel: '设计文件 / 设计图纸',
      reviewMode: 'SINGLE',
      submittedBy: 'uploader-1',
      steps: [{ mode: 'SINGLE', assigneeUserIds: ['reviewer-1'] }],
    });

    expect(reviewerEligibility.assertEligibleForReview).toHaveBeenCalledWith(
      'reviewer-1',
      'project-1',
      'uploader-1',
    );
    expect(transaction.reviewTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activeReviewKey: 'PROJECT_ARCHIVE:archive-file-1:version-1',
        sourceType: 'PROJECT_ARCHIVE',
        dueAt: expect.any(Date),
        approvalSnapshot: expect.objectContaining({
          configuredReviewMode: 'SINGLE',
          steps: [expect.objectContaining({ assigneeUserIds: ['reviewer-1'] })],
        }),
      }),
      select: { id: true },
    });
    expect(business.applySubmission).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        sourceType: 'PROJECT_ARCHIVE',
        fileVersionId: 'version-1',
        sourceRevision: 7,
      }),
    );
    expect(systemConfig.getSettings).toHaveBeenCalledTimes(1);
    const createdDueAt = (
      transaction.reviewTask.create.mock.calls[0][0].data.dueAt as Date
    ).getTime();
    expect(createdDueAt - Date.now()).toBeGreaterThan(2.9 * 24 * 60 * 60 * 1000);
  });

  it('preserves an explicit due date instead of applying the configured timeout', async () => {
    const dueAt = new Date('2030-01-01T00:00:00.000Z');
    const business = { assertSupported: jest.fn() } as unknown as ReviewBusinessService;
    const prisma = {
      reviewTask: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new ReviewTaskService(
      prisma,
      dataScope,
      reviewerEligibility,
      business,
      operationLog,
      systemConfig,
    );

    const prepared = await service.prepareTask({
      sourceType: 'STANDARD',
      sourceId: 'standard-version-1',
      sourceVersionId: 'standard-version-1',
      title: '标准 V1.0',
      reviewMode: 'SINGLE',
      submittedBy: 'user-1',
      dueAt,
      steps: [{ mode: 'SINGLE', assigneeUserIds: ['reviewer-1'] }],
    });

    expect(prepared.input.dueAt).toBe(dueAt);
    expect(systemConfig.getSettings).not.toHaveBeenCalled();
  });

  it('maps the active review unique constraint race to a business conflict', async () => {
    const business = {
      assertSupported: jest.fn(),
      applySubmission: jest.fn(),
    } as unknown as ReviewBusinessService;
    const prisma = {
      reviewTask: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new ReviewTaskService(
      prisma,
      dataScope,
      reviewerEligibility,
      business,
      operationLog,
      systemConfig,
    );
    const prepared = await service.prepareTask({
      sourceType: 'STANDARD',
      sourceId: 'standard-version-1',
      sourceVersionId: 'standard-version-1',
      title: '标准 V1.0',
      reviewMode: 'SINGLE',
      submittedBy: 'user-1',
      steps: [{ mode: 'SINGLE', assigneeUserIds: ['reviewer-1'] }],
    });
    const transaction = {
      reviewTask: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };

    await expect(service.createPreparedTask(transaction as never, prepared)).rejects.toThrow(
      new ConflictException('该业务版本已有待处理审核任务'),
    );
    expect(business.applySubmission).not.toHaveBeenCalled();
  });

  it('validates PROJECT_CREATE reviewers without project scope before the project exists', async () => {
    const business = {
      assertSupported: jest.fn(),
    } as unknown as ReviewBusinessService;
    const prisma = {
      reviewTask: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new ReviewTaskService(
      prisma,
      dataScope,
      reviewerEligibility,
      business,
      operationLog,
      systemConfig,
    );

    await service.prepareTask({
      sourceType: 'PROJECT_CREATE',
      sourceId: 'not-yet-persisted-project',
      sourceVersionId: 'not-yet-persisted-project',
      projectId: 'not-yet-persisted-project',
      title: '新建项目：测试项目',
      reviewMode: 'SINGLE',
      submittedBy: 'creator-1',
      steps: [{ mode: 'SINGLE', assigneeUserIds: ['reviewer-1'] }],
    });

    expect(reviewerEligibility.assertEligibleForReview).toHaveBeenCalledWith(
      'reviewer-1',
      undefined,
      'creator-1',
    );
  });

  it('rejects a source without a registered state adapter before persistence', async () => {
    const business = {
      assertSupported: jest.fn().mockImplementation(() => {
        throw new BadRequestException('unsupported');
      }),
    } as unknown as ReviewBusinessService;
    const prisma = { reviewTask: { findFirst: jest.fn() } } as unknown as PrismaService;
    const service = new ReviewTaskService(
      prisma,
      dataScope,
      reviewerEligibility,
      business,
      operationLog,
      systemConfig,
    );

    await expect(
      service.createTask({
        sourceType: 'STANDARD',
        sourceId: 'standard-1',
        title: '标准 V1.0',
        reviewMode: 'SINGLE',
        submittedBy: 'user-1',
        steps: [{ mode: 'SINGLE', assigneeUserIds: ['reviewer-1'] }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.reviewTask.findFirst).not.toHaveBeenCalled();
  });

  it('returns related review data to an authenticated user without a seeded view permission', async () => {
    const task = buildPendingTask();
    const prisma = {
      reviewTask: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([task]),
      },
    } as unknown as PrismaService;
    const business = { assertSupported: jest.fn() } as unknown as ReviewBusinessService;
    const service = new ReviewTaskService(
      prisma,
      dataScope,
      reviewerEligibility,
      business,
      operationLog,
      systemConfig,
    );

    const result = await service.findAll(
      { page: 2, pageSize: 10 },
      { sub: 'reviewer-1', permissions: [], roles: [] },
    );

    expect(result).toEqual({ items: [task], page: 2, pageSize: 10, total: 1 });
    expect(result).not.toHaveProperty('list');
    expect(result).not.toHaveProperty('pagination');
    expect(prisma.reviewTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('does not let a manager act unless the current step is assigned to them', async () => {
    const task = buildPendingTask();
    const transaction = buildLockedTransaction(task);
    transaction.reviewAssignee.findFirst.mockResolvedValue(null);
    const prisma = {
      reviewTask: { findFirst: jest.fn().mockResolvedValue(task) },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const business = {
      assertSupported: jest.fn(),
    } as unknown as ReviewBusinessService;
    const service = new ReviewTaskService(
      prisma,
      dataScope,
      reviewerEligibility,
      business,
      operationLog,
      systemConfig,
    );

    await expect(
      service.approve('task-1', undefined, {
        sub: 'manager-1',
        permissions: ['file_review:act', 'file_review:manage'],
        roles: [],
      }),
    ).rejects.toThrow(new ForbiddenException('当前步骤未指派给该用户或已处理'));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.reviewAssignee.updateMany).not.toHaveBeenCalled();
  });

  it('atomically completes the final threshold and applies the business decision', async () => {
    const task = buildPendingTask();
    const applyDecision = jest.fn().mockResolvedValue(undefined);
    const business = {
      assertSupported: jest.fn(),
      applyDecision,
    } as unknown as ReviewBusinessService;
    const transaction = buildLockedTransaction(task);
    const prisma = {
      reviewTask: { findFirst: jest.fn().mockResolvedValue(task) },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new ReviewTaskService(
      prisma,
      dataScope,
      reviewerEligibility,
      business,
      operationLog,
      systemConfig,
    );

    await service.approve('task-1', '同意发布', {
      sub: 'reviewer-1',
      permissions: ['file_review:act'],
      roles: [],
    });

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    const lockSql = transaction.$queryRaw.mock.calls
      .map(([query]) => (query as { strings: readonly string[] }).strings.join(' '))
      .join(' ');
    expect(lockSql).toMatch(/review_tasks[\s\S]*FOR UPDATE/);
    expect(lockSql).toMatch(/review_steps[\s\S]*FOR UPDATE/);
    expect(transaction.reviewTask.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'task-1',
        status: 'PENDING',
        currentStepNo: 1,
        activeReviewKey: { not: null },
      },
      data: {
        status: 'APPROVED',
        completedAt: expect.any(Date),
        activeReviewKey: null,
      },
    });
    expect(applyDecision).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        sourceType: 'PROJECT_ARCHIVE',
        sourceId: 'archive-file-1',
        decision: 'APPROVED',
      }),
    );
  });

  it('serializes opposite decisions so business state is applied exactly once', async () => {
    const harness = buildConcurrentHarness(['reviewer-1'], 'SINGLE', 1);
    const applyDecision = jest.fn().mockResolvedValue(undefined);
    const business = {
      assertSupported: jest.fn(),
      applyDecision,
    } as unknown as ReviewBusinessService;
    const service = new ReviewTaskService(
      harness.prisma,
      dataScope,
      reviewerEligibility,
      business,
      operationLog,
      systemConfig,
    );
    const actor = {
      sub: 'reviewer-1',
      permissions: ['file_review:act'],
      roles: [],
    };

    const results = await Promise.allSettled([
      service.approve('task-1', '通过', actor),
      service.reject('task-1', '驳回', actor),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: expect.any(ConflictException) });
    expect(applyDecision).toHaveBeenCalledTimes(1);
    expect(harness.reviewTaskUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent ANY_N approvals without losing the final threshold', async () => {
    const harness = buildConcurrentHarness(['reviewer-1', 'reviewer-2'], 'ANY_N', 2);
    const applyDecision = jest.fn().mockResolvedValue(undefined);
    const business = {
      assertSupported: jest.fn(),
      applyDecision,
    } as unknown as ReviewBusinessService;
    const service = new ReviewTaskService(
      harness.prisma,
      dataScope,
      reviewerEligibility,
      business,
      operationLog,
      systemConfig,
    );

    const results = await Promise.allSettled([
      service.approve('task-1', '审批人一通过', {
        sub: 'reviewer-1',
        permissions: ['file_review:act'],
        roles: [],
      }),
      service.approve('task-1', '审批人二通过', {
        sub: 'reviewer-2',
        permissions: ['file_review:act'],
        roles: [],
      }),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(applyDecision).toHaveBeenCalledTimes(1);
    expect(harness.reviewTaskUpdateMany).toHaveBeenCalledTimes(1);
    expect(harness.state.taskStatus).toBe('APPROVED');
    expect(harness.state.stepStatus).toBe('APPROVED');
    expect(Array.from(harness.state.assignments.values())).toEqual(['APPROVED', 'APPROVED']);
  });

  it.each([
    ['STANDARD', 'StandardPublished', 'standard', 'standard-version-1'],
    ['KNOWLEDGE', 'KnowledgePublished', 'knowledge', 'knowledge-version-1'],
    [
      'ARCHIVE_TEMPLATE',
      'ArchiveTemplatePublished',
      'archive_template',
      'archive-template-version-1',
    ],
  ])(
    'enqueues the %s publication event with the dispatcher identity contract',
    async (sourceType, eventType, aggregateType, sourceVersionId) => {
      const task = {
        ...buildPendingTask(),
        sourceType,
        sourceId: sourceVersionId,
        fileVersionId: sourceVersionId,
      };
      const business = {
        assertSupported: jest.fn(),
        applyDecision: jest.fn().mockResolvedValue(undefined),
      } as unknown as ReviewBusinessService;
      const transaction = buildLockedTransaction(task);
      const prisma = {
        reviewTask: { findFirst: jest.fn().mockResolvedValue(task) },
        $transaction: jest
          .fn()
          .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
          ),
      } as unknown as PrismaService;
      const service = new ReviewTaskService(
        prisma,
        dataScope,
        reviewerEligibility,
        business,
        operationLog,
        systemConfig,
      );

      await service.approve('task-1', '同意发布', {
        sub: 'reviewer-1',
        permissions: ['file_review:act'],
        roles: [],
      });

      expect(transaction.outboxEvent.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          eventType,
          aggregateType,
          aggregateId: sourceVersionId,
          deduplicationKey: `${eventType}:${sourceVersionId}`,
          payload: {
            reviewTaskId: 'task-1',
            sourceId: sourceVersionId,
            publishedBy: 'reviewer-1',
          },
        }),
      });
    },
  );

  function buildPendingTask() {
    return {
      id: 'task-1',
      sourceType: 'PROJECT_ARCHIVE',
      sourceId: 'archive-file-1',
      fileVersionId: 'version-1',
      status: 'PENDING',
      currentStepNo: 1,
      steps: [
        {
          id: 'step-1',
          stepNo: 1,
          status: 'ACTIVE',
          mode: 'SINGLE',
          requiredCount: 1,
          assignees: [
            {
              id: 'assignment-1',
              assigneeUserId: 'reviewer-1',
              status: 'PENDING',
            },
          ],
        },
      ],
    };
  }

  function buildLockedTransaction(task: ReturnType<typeof buildPendingTask>) {
    const step = task.steps[0];
    return {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: task.id,
            source_type: task.sourceType,
            source_id: task.sourceId,
            file_version_id: task.fileVersionId,
            status: task.status,
            current_step_no: task.currentStepNo,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: step.id,
            step_no: step.stepNo,
            mode: step.mode,
            required_count: step.requiredCount,
            status: step.status,
          },
        ]),
      reviewAssignee: {
        findFirst: jest.fn().mockResolvedValue({ id: step.assignees[0].id }),
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(1),
      },
      reviewActionEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
      reviewStep: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      reviewTask: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) },
    };
  }

  function buildConcurrentHarness(
    assigneeIds: string[],
    mode: 'SINGLE' | 'ANY_N',
    requiredCount: number,
  ) {
    const task = buildPendingTask();
    task.steps[0].mode = mode;
    task.steps[0].requiredCount = requiredCount;
    task.steps[0].assignees = assigneeIds.map((assigneeUserId, index) => ({
      id: `assignment-${index + 1}`,
      assigneeUserId,
      status: 'PENDING',
    }));
    const state = {
      taskStatus: 'PENDING',
      stepStatus: 'ACTIVE',
      assignments: new Map(assigneeIds.map((id) => [id, 'PENDING'])),
    };
    const reviewTaskUpdateMany = jest.fn(
      async ({ data }: { data: { status?: string; currentStepNo?: number } }) => {
        if (state.taskStatus !== 'PENDING') return { count: 0 };
        if (data.status) state.taskStatus = data.status;
        return { count: 1 };
      },
    );
    const reviewStepUpdateMany = jest.fn(async ({ data }: { data: { status: string } }) => {
      if (state.stepStatus !== 'ACTIVE') return { count: 0 };
      state.stepStatus = data.status;
      return { count: 1 };
    });

    const makeTransaction = () => {
      let rawCall = 0;
      return {
        $queryRaw: jest.fn().mockImplementation(async () => {
          rawCall += 1;
          if (rawCall === 1) {
            return [
              {
                id: task.id,
                source_type: task.sourceType,
                source_id: task.sourceId,
                file_version_id: task.fileVersionId,
                status: state.taskStatus,
                current_step_no: task.currentStepNo,
              },
            ];
          }
          return [
            {
              id: task.steps[0].id,
              step_no: task.steps[0].stepNo,
              mode,
              required_count: requiredCount,
              status: state.stepStatus,
            },
          ];
        }),
        reviewAssignee: {
          findFirst: jest
            .fn()
            .mockImplementation(({ where }: { where: { assigneeUserId: string } }) => {
              const status = state.assignments.get(where.assigneeUserId);
              const index = assigneeIds.indexOf(where.assigneeUserId);
              return status === 'PENDING' && index >= 0 ? { id: `assignment-${index + 1}` } : null;
            }),
          updateMany: jest
            .fn()
            .mockImplementation(
              ({
                where,
                data,
              }: {
                where: { id?: string; status?: string };
                data: { status: string };
              }) => {
                if (where.id) {
                  const index = Number(where.id.replace('assignment-', '')) - 1;
                  const assigneeId = assigneeIds[index];
                  if (!assigneeId || state.assignments.get(assigneeId) !== 'PENDING') {
                    return { count: 0 };
                  }
                  state.assignments.set(assigneeId, data.status);
                  return { count: 1 };
                }
                let count = 0;
                for (const [assigneeId, status] of state.assignments) {
                  if (status === 'PENDING') {
                    state.assignments.set(assigneeId, data.status);
                    count += 1;
                  }
                }
                return { count };
              },
            ),
          count: jest
            .fn()
            .mockImplementation(({ where }: { where: { status?: string } }) =>
              where.status
                ? Array.from(state.assignments.values()).filter((status) => status === where.status)
                    .length
                : state.assignments.size,
            ),
        },
        reviewActionEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
        reviewStep: {
          updateMany: reviewStepUpdateMany,
          findFirst: jest.fn().mockResolvedValue(null),
        },
        reviewTask: { updateMany: reviewTaskUpdateMany },
        outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) },
      };
    };

    let transactionTail = Promise.resolve();
    const prisma = {
      reviewTask: { findFirst: jest.fn().mockResolvedValue(task) },
      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: (tx: ReturnType<typeof makeTransaction>) => Promise<unknown>) => {
            const previous = transactionTail;
            let release!: () => void;
            transactionTail = new Promise<void>((resolve) => {
              release = resolve;
            });
            await previous;
            try {
              return await callback(makeTransaction());
            } finally {
              release();
            }
          },
        ),
    } as unknown as PrismaService;

    return { prisma, state, reviewTaskUpdateMany, reviewStepUpdateMany };
  }
});
