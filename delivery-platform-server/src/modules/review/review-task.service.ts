import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { enqueueDomainEvent } from '../../common/events/outbox';
import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { DataScopeService } from '../identity/data-scope/data-scope.service';
import { OperationLogService } from '../operation-log/operation-log.service';
import { SystemConfigService } from '../system-config/system-config.service';

import { QueryReviewTaskDto } from './dto/review-task.dto';
import { ReviewBusinessService } from './review-business.service';
import { ReviewerEligibilityService } from './reviewer-eligibility.service';

export type ReviewMode = 'SINGLE' | 'ALL_SIGN' | 'ANY_N' | 'SERIAL' | 'PARALLEL';

export interface CreateReviewTaskStepInput {
  mode: ReviewMode;
  requiredCount?: number;
  assigneeUserIds: string[];
  resolvedFromType?: string;
  resolvedFromValue?: string;
}

export interface CreateUnifiedReviewTaskInput {
  sourceType: string;
  sourceId: string;
  sourceVersionId?: string;
  projectId?: string;
  fileVersionId?: string;
  approvalTemplateId?: string;
  approvalTemplateVersion?: string;
  approvalSnapshot?: Prisma.InputJsonValue;
  title: string;
  locationLabel?: string;
  reviewMode: ReviewMode;
  submittedBy: string;
  dueAt?: Date;
  steps: CreateReviewTaskStepInput[];
}

export interface PreparedReviewTask {
  input: CreateUnifiedReviewTaskInput;
  normalizedSteps: Array<CreateReviewTaskStepInput & { requiredCount: number }>;
  activeReviewKey: string;
  submittedAt: Date;
}

interface LockedReviewTaskRow {
  id: string;
  source_type: string;
  source_id: string;
  file_version_id: string | null;
  status: string;
  current_step_no: number;
}

interface LockedReviewStepRow {
  id: string;
  step_no: number;
  mode: string;
  required_count: number;
  status: string;
}

type ReviewActor = Pick<JwtPayload, 'sub' | 'permissions' | 'roles'>;

const actionPermissions = new Set(['file_review:act']);

@Injectable()
export class ReviewTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScope: DataScopeService,
    private readonly reviewerEligibility: ReviewerEligibilityService,
    private readonly business: ReviewBusinessService,
    private readonly operationLog: OperationLogService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async createTask(input: CreateUnifiedReviewTaskInput) {
    const prepared = await this.prepareTask(input);
    const taskId = await this.prisma.$transaction((tx) => this.createPreparedTask(tx, prepared));

    await this.logTaskCreated(prepared.input, taskId);
    return this.findTaskByIdForSystem(taskId);
  }

  async prepareTask(input: CreateUnifiedReviewTaskInput): Promise<PreparedReviewTask> {
    this.business.assertSupported(input.sourceType);
    const normalizedSteps = this.normalizeSteps(input.reviewMode, input.steps);
    const activeReviewKey = this.buildActiveReviewKey(input);
    const submittedAt = new Date();
    const preparedInput = input.dueAt
      ? input
      : {
          ...input,
          dueAt: await this.resolveDefaultDueAt(submittedAt),
        };
    const allAssignees = Array.from(
      new Set(normalizedSteps.flatMap((step) => step.assigneeUserIds)),
    );
    await Promise.all(
      allAssignees.map((userId) =>
        this.reviewerEligibility.assertEligibleForReview(
          userId,
          input.sourceType === 'PROJECT_CREATE' ? undefined : input.projectId,
          input.submittedBy,
        ),
      ),
    );

    const pending = await this.prisma.reviewTask.findFirst({
      where: { activeReviewKey },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException('该业务版本已有待处理审核任务');
    }

    return { input: preparedInput, normalizedSteps, activeReviewKey, submittedAt };
  }

  async createPreparedTask(
    tx: Prisma.TransactionClient,
    prepared: PreparedReviewTask,
  ): Promise<string> {
    const { input, normalizedSteps, activeReviewKey, submittedAt } = prepared;
    const pending = await tx.reviewTask.findFirst({
      where: { activeReviewKey },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException('该业务版本已有待处理审核任务');
    }
    const snapshot: Prisma.InputJsonObject = {
      configuredReviewMode: input.reviewMode,
      steps: normalizedSteps.map((step, index) => ({
        stepNo: index + 1,
        mode: step.mode,
        requiredCount: step.requiredCount,
        assigneeUserIds: step.assigneeUserIds,
        resolvedFromType: step.resolvedFromType ?? null,
        resolvedFromValue: step.resolvedFromValue ?? null,
      })),
    };
    let task: { id: string };
    try {
      task = await tx.reviewTask.create({
        data: {
          activeReviewKey,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceVersionId: input.sourceVersionId,
          projectId: input.projectId,
          fileVersionId: input.fileVersionId,
          approvalTemplateId: input.approvalTemplateId,
          approvalTemplateVersion: input.approvalTemplateVersion,
          approvalSnapshot: input.approvalSnapshot ?? snapshot,
          title: input.title,
          locationLabel: input.locationLabel,
          reviewMode: input.reviewMode,
          currentStepNo: 1,
          totalSteps: normalizedSteps.length,
          submittedBy: input.submittedBy,
          submittedAt,
          dueAt: input.dueAt,
        },
        select: { id: true },
      });
    } catch (error) {
      if (this.isUniqueConstraintConflict(error)) {
        throw new ConflictException('该业务版本已有待处理审核任务');
      }
      throw error;
    }

    for (const [index, stepInput] of normalizedSteps.entries()) {
      const stepNo = index + 1;
      const step = await tx.reviewStep.create({
        data: {
          reviewTaskId: task.id,
          stepNo,
          mode: stepInput.mode,
          requiredCount: stepInput.requiredCount,
          status: stepNo === 1 ? 'ACTIVE' : 'WAITING',
          startedAt: stepNo === 1 ? submittedAt : null,
          configurationSnapshot: {
            mode: stepInput.mode,
            requiredCount: stepInput.requiredCount,
            assigneeUserIds: stepInput.assigneeUserIds,
            resolvedFromType: stepInput.resolvedFromType ?? null,
            resolvedFromValue: stepInput.resolvedFromValue ?? null,
          },
        },
        select: { id: true },
      });
      await tx.reviewAssignee.createMany({
        data: stepInput.assigneeUserIds.map((assigneeUserId) => ({
          reviewStepId: step.id,
          assigneeUserId,
          resolvedFromType: stepInput.resolvedFromType,
          resolvedFromValue: stepInput.resolvedFromValue,
          status: stepNo === 1 ? 'PENDING' : 'WAITING',
          resolutionMetadata: {
            resolvedAt: submittedAt.toISOString(),
            eligibilityChecked: true,
          },
        })),
      });
    }

    await tx.reviewActionEvent.create({
      data: {
        reviewTaskId: task.id,
        actorUserId: input.submittedBy,
        action: 'SUBMITTED',
        metadata: { sourceType: input.sourceType, sourceId: input.sourceId },
      },
    });
    await enqueueDomainEvent(tx, {
      eventType: 'ReviewTaskCreated',
      aggregateType: 'review_task',
      aggregateId: task.id,
      deduplicationKey: `ReviewTaskCreated:${task.id}`,
      payload: {
        taskId: task.id,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        submittedBy: input.submittedBy,
      },
    });
    await this.business.applySubmission(tx, {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      fileVersionId: input.fileVersionId ?? null,
      submittedAt,
      submittedBy: input.submittedBy,
    });
    return task.id;
  }

  async logPreparedTaskCreated(prepared: PreparedReviewTask, taskId: string): Promise<void> {
    await this.logTaskCreated(prepared.input, taskId);
  }

  private async logTaskCreated(input: CreateUnifiedReviewTaskInput, taskId: string): Promise<void> {
    await this.operationLog.log({
      userId: input.submittedBy,
      module: 'file-review',
      action: 'submit',
      targetType: input.sourceType,
      targetId: input.sourceId,
      afterData: { taskId, sourceVersionId: input.sourceVersionId ?? null },
    });
  }

  async getSummary(actor: ReviewActor) {
    const where = await this.buildVisibilityWhere(actor);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const [groups, myPending, allPending, todayAdded, overdue] = await Promise.all([
      this.prisma.reviewTask.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.reviewTask.count({
        where: {
          AND: [
            where,
            {
              status: 'PENDING',
              archivedAt: null,
              steps: {
                some: {
                  status: 'ACTIVE',
                  assignees: {
                    some: { assigneeUserId: actor.sub, status: 'PENDING' },
                  },
                },
              },
            },
          ],
        },
      }),
      this.prisma.reviewTask.count({
        where: { AND: [where, { status: 'PENDING', archivedAt: null }] },
      }),
      this.prisma.reviewTask.count({
        where: {
          AND: [where, { archivedAt: null, submittedAt: { gte: startOfToday } }],
        },
      }),
      this.prisma.reviewTask.count({
        where: {
          AND: [where, { status: 'PENDING', archivedAt: null, dueAt: { lt: new Date() } }],
        },
      }),
    ]);
    const counts = new Map(groups.map((group) => [group.status, group._count._all]));
    const pending = allPending;
    const approved = counts.get('APPROVED') ?? 0;
    const rejected = counts.get('REJECTED') ?? 0;
    return {
      myPending,
      allPending,
      todayAdded,
      overdue,
      total: pending + approved + rejected,
      pending,
      approved,
      rejected,
    };
  }

  async findAll(query: QueryReviewTaskDto, actor: ReviewActor) {
    const { page = 1, pageSize = 20 } = query;
    const visibility = await this.buildVisibilityWhere(actor);
    const where: Prisma.ReviewTaskWhereInput = {
      AND: [
        visibility,
        {
          ...(query.sourceType && { sourceType: query.sourceType }),
          ...(query.status && { status: query.status }),
          ...(query.keyword && {
            OR: [
              { title: { contains: query.keyword } },
              { locationLabel: { contains: query.keyword } },
            ],
          }),
          archivedAt: null,
        },
      ],
    };
    const [total, list] = await Promise.all([
      this.prisma.reviewTask.count({ where }),
      this.prisma.reviewTask.findMany({
        where,
        include: this.taskInclude(),
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { submittedAt: 'desc' },
      }),
    ]);
    return {
      items: list,
      page,
      pageSize,
      total,
    };
  }

  async findById(taskId: string, actor: ReviewActor) {
    const visibility = await this.buildVisibilityWhere(actor);
    const task = await this.prisma.reviewTask.findFirst({
      where: { AND: [{ id: taskId, archivedAt: null }, visibility] },
      include: this.taskInclude(true),
    });
    if (!task) {
      throw new NotFoundException('审核任务不存在');
    }
    return task;
  }

  async getHistory(taskId: string, actor: ReviewActor) {
    await this.findById(taskId, actor);
    return this.prisma.reviewActionEvent.findMany({
      where: { reviewTaskId: taskId },
      include: { actor: { select: { id: true, realName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approve(taskId: string, comment: string | undefined, actor: ReviewActor) {
    return this.act(taskId, 'APPROVED', comment, actor);
  }

  async reject(taskId: string, comment: string, actor: ReviewActor) {
    return this.act(taskId, 'REJECTED', comment, actor);
  }

  private async act(
    taskId: string,
    decision: 'APPROVED' | 'REJECTED',
    comment: string | undefined,
    actor: ReviewActor,
  ) {
    this.assertCanAct(actor);
    // The first read applies data-scope visibility. State and assignment are
    // checked again below while the authoritative task and step rows are locked.
    await this.findById(taskId, actor);
    const decidedAt = new Date();
    const outcome = await this.prisma.$transaction(async (tx) => {
      const [task] = await tx.$queryRaw<LockedReviewTaskRow[]>(Prisma.sql`
        SELECT
          id,
          source_type,
          source_id,
          file_version_id,
          status,
          current_step_no
        FROM review_tasks
        WHERE id = ${taskId}
          AND archived_at IS NULL
        FOR UPDATE
      `);
      if (!task) {
        throw new NotFoundException('审核任务不存在');
      }
      if (task.status !== 'PENDING') {
        throw new ConflictException('审核任务已处理，请刷新后重试');
      }

      const [step] = await tx.$queryRaw<LockedReviewStepRow[]>(Prisma.sql`
        SELECT
          id,
          step_no,
          mode,
          required_count,
          status
        FROM review_steps
        WHERE review_task_id = ${task.id}
          AND step_no = ${task.current_step_no}
        FOR UPDATE
      `);
      if (!step || step.status !== 'ACTIVE') {
        throw new ConflictException('审核任务当前步骤状态异常，请刷新后重试');
      }

      const assignment = await tx.reviewAssignee.findFirst({
        where: {
          reviewStepId: step.id,
          assigneeUserId: actor.sub,
          status: 'PENDING',
        },
        select: { id: true },
      });
      if (!assignment) {
        throw new ForbiddenException('当前步骤未指派给该用户或已处理');
      }

      const claimed = await tx.reviewAssignee.updateMany({
        where: { id: assignment.id, status: 'PENDING' },
        data: {
          status: decision,
          decision,
          actedAt: decidedAt,
          comment: comment ?? null,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('审核动作已被处理，请刷新后重试');
      }
      await tx.reviewActionEvent.create({
        data: {
          reviewTaskId: task.id,
          stepNo: step.step_no,
          actorUserId: actor.sub,
          action: decision,
          comment,
        },
      });

      if (decision === 'REJECTED') {
        const rejectedStep = await tx.reviewStep.updateMany({
          where: { id: step.id, status: 'ACTIVE' },
          data: { status: 'REJECTED', completedAt: decidedAt },
        });
        if (rejectedStep.count !== 1) {
          throw new ConflictException('审核步骤已变化，请刷新后重试');
        }
        await tx.reviewStep.updateMany({
          where: {
            reviewTaskId: task.id,
            stepNo: { gt: step.step_no },
            status: 'WAITING',
          },
          data: { status: 'SKIPPED' },
        });
        await tx.reviewAssignee.updateMany({
          where: {
            reviewStep: { reviewTaskId: task.id },
            status: { in: ['PENDING', 'WAITING'] },
          },
          data: { status: 'SKIPPED' },
        });
        const rejectedTask = await tx.reviewTask.updateMany({
          where: {
            id: task.id,
            status: 'PENDING',
            currentStepNo: step.step_no,
            activeReviewKey: { not: null },
          },
          data: {
            status: 'REJECTED',
            completedAt: decidedAt,
            activeReviewKey: null,
          },
        });
        if (rejectedTask.count !== 1) {
          throw new ConflictException('审核任务已变化，请刷新后重试');
        }
        await this.business.applyDecision(tx, {
          sourceType: task.source_type,
          sourceId: task.source_id,
          fileVersionId: task.file_version_id,
          decision,
          actorUserId: actor.sub,
          decidedAt,
        });
        await enqueueDomainEvent(tx, {
          eventType: 'ReviewTaskRejected',
          aggregateType: 'review_task',
          aggregateId: task.id,
          deduplicationKey: `ReviewTaskRejected:${task.id}`,
          payload: {
            taskId: task.id,
            sourceType: task.source_type,
            sourceId: task.source_id,
            rejectedBy: actor.sub,
          },
        });
        return { sourceType: task.source_type, sourceId: task.source_id };
      }

      const [approvedCount, assigneeCount] = await Promise.all([
        tx.reviewAssignee.count({
          where: { reviewStepId: step.id, status: 'APPROVED' },
        }),
        tx.reviewAssignee.count({ where: { reviewStepId: step.id } }),
      ]);
      const requiredCount =
        step.mode === 'ALL_SIGN' ? assigneeCount : Math.max(1, step.required_count);
      if (approvedCount < requiredCount) {
        return { sourceType: task.source_type, sourceId: task.source_id };
      }

      const approvedStep = await tx.reviewStep.updateMany({
        where: { id: step.id, status: 'ACTIVE' },
        data: { status: 'APPROVED', completedAt: decidedAt },
      });
      if (approvedStep.count !== 1) {
        throw new ConflictException('审核步骤已变化，请刷新后重试');
      }
      await tx.reviewAssignee.updateMany({
        where: { reviewStepId: step.id, status: 'PENDING' },
        data: { status: 'SKIPPED' },
      });
      const nextStep = await tx.reviewStep.findFirst({
        where: {
          reviewTaskId: task.id,
          stepNo: { gt: step.step_no },
        },
        select: { id: true, stepNo: true },
        orderBy: { stepNo: 'asc' },
      });
      if (nextStep) {
        const activatedStep = await tx.reviewStep.updateMany({
          where: { id: nextStep.id, status: 'WAITING' },
          data: { status: 'ACTIVE', startedAt: decidedAt },
        });
        if (activatedStep.count !== 1) {
          throw new ConflictException('下一审核步骤状态异常，请刷新后重试');
        }
        await tx.reviewAssignee.updateMany({
          where: { reviewStepId: nextStep.id, status: 'WAITING' },
          data: { status: 'PENDING' },
        });
        const advancedTask = await tx.reviewTask.updateMany({
          where: {
            id: task.id,
            status: 'PENDING',
            currentStepNo: step.step_no,
            activeReviewKey: { not: null },
          },
          data: { currentStepNo: nextStep.stepNo },
        });
        if (advancedTask.count !== 1) {
          throw new ConflictException('审核任务已变化，请刷新后重试');
        }
        return { sourceType: task.source_type, sourceId: task.source_id };
      }

      const approvedTask = await tx.reviewTask.updateMany({
        where: {
          id: task.id,
          status: 'PENDING',
          currentStepNo: step.step_no,
          activeReviewKey: { not: null },
        },
        data: {
          status: 'APPROVED',
          completedAt: decidedAt,
          activeReviewKey: null,
        },
      });
      if (approvedTask.count !== 1) {
        throw new ConflictException('审核任务已变化，请刷新后重试');
      }
      await this.business.applyDecision(tx, {
        sourceType: task.source_type,
        sourceId: task.source_id,
        fileVersionId: task.file_version_id,
        decision,
        actorUserId: actor.sub,
        decidedAt,
      });
      await enqueueDomainEvent(tx, {
        eventType: 'ReviewTaskApproved',
        aggregateType: 'review_task',
        aggregateId: task.id,
        deduplicationKey: `ReviewTaskApproved:${task.id}`,
        payload: {
          taskId: task.id,
          sourceType: task.source_type,
          sourceId: task.source_id,
          approvedBy: actor.sub,
        },
      });
      const publishedEventType =
        task.source_type === 'STANDARD'
          ? 'StandardPublished'
          : task.source_type === 'KNOWLEDGE'
            ? 'KnowledgePublished'
            : task.source_type === 'ARCHIVE_TEMPLATE'
              ? 'ArchiveTemplatePublished'
              : null;
      if (publishedEventType) {
        await enqueueDomainEvent(tx, {
          eventType: publishedEventType,
          aggregateType: task.source_type.toLowerCase(),
          aggregateId: task.source_id,
          deduplicationKey: `${publishedEventType}:${task.source_id}`,
          payload: {
            reviewTaskId: task.id,
            sourceId: task.source_id,
            publishedBy: actor.sub,
          },
        });
      }
      return { sourceType: task.source_type, sourceId: task.source_id };
    });

    await this.operationLog.log({
      userId: actor.sub,
      module: 'file-review',
      action: decision.toLowerCase(),
      targetType: 'review_task',
      targetId: taskId,
      afterData: outcome,
    });
    return this.findById(taskId, actor);
  }

  private buildActiveReviewKey(input: CreateUnifiedReviewTaskInput): string {
    return `${input.sourceType}:${input.sourceId}:${input.sourceVersionId ?? '-'}`;
  }

  private async resolveDefaultDueAt(submittedAt: Date): Promise<Date> {
    const settings = await this.systemConfig.getSettings();
    const timeoutDays = Math.max(1, settings.approval.timeoutDays);
    return new Date(submittedAt.getTime() + timeoutDays * 24 * 60 * 60 * 1000);
  }

  private isUniqueConstraintConflict(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002',
    );
  }

  private normalizeSteps(
    reviewMode: ReviewMode,
    steps: CreateReviewTaskStepInput[],
  ): Array<CreateReviewTaskStepInput & { requiredCount: number }> {
    if (steps.length === 0) {
      throw new BadRequestException('审核任务至少需要一个审核步骤');
    }
    return steps.map((step) => {
      const assigneeUserIds = Array.from(new Set(step.assigneeUserIds));
      if (assigneeUserIds.length === 0) {
        throw new BadRequestException('审核步骤至少需要一名有效审核人');
      }
      if ((reviewMode === 'SERIAL' || step.mode === 'SINGLE') && assigneeUserIds.length !== 1) {
        throw new BadRequestException('单人或串行审核的每个步骤只能配置一名审核人');
      }
      const requiredCount =
        step.mode === 'ALL_SIGN'
          ? assigneeUserIds.length
          : (step.requiredCount ?? (step.mode === 'PARALLEL' ? assigneeUserIds.length : 1));
      if (requiredCount < 1 || requiredCount > assigneeUserIds.length) {
        throw new BadRequestException('审核步骤通过人数配置无效');
      }
      return { ...step, assigneeUserIds, requiredCount };
    });
  }

  private async buildVisibilityWhere(actor: ReviewActor): Promise<Prisma.ReviewTaskWhereInput> {
    const projectWhere = await this.dataScope.buildProjectWhere(actor.sub);
    const projectVisibility: Prisma.ReviewTaskWhereInput = {
      OR: [{ projectId: null }, { project: projectWhere }],
    };
    if (this.canViewAll(actor)) return projectVisibility;
    return {
      AND: [
        projectVisibility,
        {
          OR: [
            { submittedBy: actor.sub },
            {
              steps: {
                some: { assignees: { some: { assigneeUserId: actor.sub } } },
              },
            },
          ],
        },
      ],
    };
  }

  private taskInclude(withHistory = false) {
    return {
      submitter: { select: { id: true, realName: true } },
      fileVersion: {
        include: {
          logicalFile: {
            select: { id: true, currentVersionId: true, displayName: true },
          },
          asset: {
            select: {
              id: true,
              originalName: true,
              extension: true,
              mimeType: true,
              size: true,
            },
          },
        },
      },
      steps: {
        include: {
          assignees: {
            include: { assignee: { select: { id: true, realName: true } } },
            orderBy: { createdAt: 'asc' as const },
          },
        },
        orderBy: { stepNo: 'asc' as const },
      },
      ...(withHistory && {
        actionEvents: {
          include: { actor: { select: { id: true, realName: true } } },
          orderBy: { createdAt: 'asc' as const },
        },
      }),
    };
  }

  private async findTaskByIdForSystem(taskId: string) {
    const task = await this.prisma.reviewTask.findUnique({
      where: { id: taskId },
      include: this.taskInclude(true),
    });
    if (!task) throw new NotFoundException('审核任务不存在');
    return task;
  }

  private canViewAll(actor: ReviewActor): boolean {
    return (
      actor.roles.includes('SUPER_ADMIN') ||
      actor.permissions.includes('file_review:view_all') ||
      actor.permissions.includes('file_review:manage')
    );
  }

  private assertCanAct(actor: ReviewActor): void {
    if (
      actor.roles.includes('SUPER_ADMIN') ||
      actor.permissions.some((permission) => actionPermissions.has(permission))
    ) {
      return;
    }
    throw new ForbiddenException('缺少文件审核操作权限');
  }
}
