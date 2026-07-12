import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RiskLevel, type Project } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { enqueueDomainEvent } from '../../common/events/outbox';
import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ProjectArchiveSnapshotService } from '../project-archive/project-archive-snapshot.service';
import { ReviewConfigurationService } from '../review/review-configuration.service';
import { type PreparedReviewTask, ReviewTaskService } from '../review/review-task.service';
import { SystemConfigService } from '../system-config/system-config.service';

import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectStatusActionDto } from './dto/project-status-action.dto';
import { QueryProjectDto } from './dto/query-project.dto';
import { UpdateProjectAcceptanceDto } from './dto/update-project-acceptance.dto';
import { UpdateProjectStageDto } from './dto/update-project-stage.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectAccessService } from './project-access.service';
import {
  hashProjectCreateRequest,
  validateProjectCreateIdempotencyKey,
} from './project-create-idempotency';
import {
  PROJECT_DELIVERY_STAGES,
  type ProjectDeliveryStage,
  type ProjectLifecycleStatus,
  type ProjectSummaryFilter,
} from './project.constants';

type ProjectActor = Pick<JwtPayload, 'sub' | 'permissions' | 'roles'> | string;
type ProjectStatusCommand = 'pause' | 'resume' | 'complete' | 'cancel' | 'archive' | 'restore';

const idempotentProjectSelect = {
  id: true,
  createdBy: true,
  createRequestHash: true,
} satisfies Prisma.ProjectSelect;

type IdempotentProject = Prisma.ProjectGetPayload<{
  select: typeof idempotentProjectSelect;
}>;

export interface ProjectReadAuditContext {
  ipAddress?: string;
  userAgent?: string;
}

interface ProjectListItem {
  id: string;
  projectCode: string;
  projectName: string;
  shortName: string | null;
  countryCode: string;
  countryName: string | null;
  city: string | null;
  customerName: string | null;
  projectType: string | null;
  contractCurrency?: string | null;
  baseCurrency?: string | null;
  contractAmount?: number | null;
  exchangeRate?: number | null;
  convertedAmount?: number | null;
  exchangeRateDate?: Date | null;
  exchangeRateSource?: string | null;
  projectLanguage: string | null;
  salesOwnerId: string | null;
  revision: number;
  status: ProjectLifecycleStatus;
  currentStage: ProjectDeliveryStage;
  progressPercent: number | null;
  riskLevel: string;
  riskDescription: string | null;
  contractNo: string | null;
  contractSignedAt: Date | null;
  startDate: Date | null;
  plannedEndDate: Date | null;
  actualEndDate: Date | null;
  expectedAcceptanceAt: Date | null;
  actualAcceptanceAt: Date | null;
  acceptanceTimeType: 'ACTUAL' | 'EXPECTED' | 'NONE';
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: Array<{
    id: string;
    userId: string;
    projectRole: string;
    user: { id: string; realName: string; username: string };
  }>;
}

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
    private readonly projectArchiveSnapshot: ProjectArchiveSnapshotService,
    @Inject(forwardRef(() => ReviewConfigurationService))
    private readonly reviewConfiguration: ReviewConfigurationService,
    @Inject(forwardRef(() => ReviewTaskService))
    private readonly reviewTasks: ReviewTaskService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async findAll(
    query: QueryProjectDto,
    actor?: ProjectActor,
    auditContext?: ProjectReadAuditContext,
  ): Promise<PaginatedResult<ProjectListItem>> {
    const userId = this.getUserId(actor);
    const {
      page = 1,
      pageSize: requestedPageSize,
      keyword,
      lifecycleStatus,
      countryCode,
      projectType,
      summaryFilter,
      sort,
    } = query;
    const pageSize = requestedPageSize ?? (await this.systemConfig.getDefaultProjectPageSize());

    const scope: Prisma.ProjectWhereInput = userId
      ? await this.projectAccess.buildProjectWhere(userId)
      : { deletedAt: null };
    const filters: Prisma.ProjectWhereInput[] = [];

    if (keyword) {
      filters.push({
        OR: [
          { projectName: { contains: keyword } },
          { projectCode: { contains: keyword } },
          { customerName: { contains: keyword } },
        ],
      });
    }

    if (lifecycleStatus) {
      filters.push({ status: lifecycleStatus });
    }

    if (countryCode) {
      filters.push({ countryCode });
    }

    if (projectType) {
      filters.push({ projectType });
    }

    if (summaryFilter && summaryFilter !== 'ALL') {
      filters.push(this.buildSummaryFilterWhere(summaryFilter));
    }

    const where: Prisma.ProjectWhereInput = {
      AND: [scope, ...filters],
    };

    const [total, list] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        select: {
          id: true,
          projectCode: true,
          projectName: true,
          shortName: true,
          countryCode: true,
          city: true,
          customerName: true,
          projectType: true,
          contractCurrency: true,
          baseCurrency: true,
          contractAmount: true,
          exchangeRate: true,
          convertedAmount: true,
          exchangeRateDate: true,
          exchangeRateSource: true,
          projectLanguage: true,
          salesOwnerId: true,
          revision: true,
          status: true,
          currentStage: true,
          progressPercent: true,
          riskLevel: true,
          riskDescription: true,
          contractNo: true,
          contractSignedAt: true,
          startDate: true,
          plannedEndDate: true,
          actualEndDate: true,
          expectedAcceptanceAt: true,
          actualAcceptanceAt: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
          members: {
            select: {
              id: true,
              userId: true,
              projectRole: true,
              user: {
                select: {
                  id: true,
                  realName: true,
                  username: true,
                },
              },
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: this.resolveProjectOrderBy(sort),
      }),
    ]);

    const countryNames = await this.getCountryNames(list.map((project) => project.countryCode));
    const projectList: ProjectListItem[] = list.map((project) =>
      this.toProjectResponse(
        { ...project, countryName: countryNames.get(project.countryCode) ?? null },
        actor,
      ),
    );

    await this.auditSensitiveRead(
      actor,
      auditContext,
      'view_financial_list',
      this.getUserId(actor),
      {
        keyword: keyword ?? null,
        lifecycleStatus: lifecycleStatus ?? null,
        countryCode: countryCode ?? null,
        projectType: projectType ?? null,
        summaryFilter: summaryFilter ?? null,
        resultCount: projectList.length,
      },
    );

    return {
      items: projectList,
      page,
      pageSize,
      total,
    };
  }

  async getSummary(actor: ProjectActor): Promise<{
    total: number;
    active: number;
    accepted: number;
    highRisk: number;
  }> {
    const userId = this.getUserId(actor);
    if (!userId) {
      throw new ForbiddenException('缺少用户上下文');
    }
    const scope = await this.projectAccess.buildProjectWhere(userId);
    const [total, active, accepted, highRisk] = await Promise.all([
      this.prisma.project.count({ where: scope }),
      this.prisma.project.count({
        where: {
          AND: [scope, this.buildSummaryFilterWhere('ACTIVE')],
        },
      }),
      this.prisma.project.count({
        where: {
          AND: [scope, this.buildSummaryFilterWhere('ACCEPTED')],
        },
      }),
      this.prisma.project.count({
        where: {
          AND: [scope, this.buildSummaryFilterWhere('HIGH_RISK')],
        },
      }),
    ]);
    return { total, active, accepted, highRisk };
  }

  async findById(id: string, actor?: ProjectActor, auditContext?: ProjectReadAuditContext) {
    const userId = this.getUserId(actor);
    const projectScope = userId
      ? await this.projectAccess.buildProjectWhere(userId)
      : { deletedAt: null };
    const project = await this.prisma.project.findFirst({
      where: { ...projectScope, id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                realName: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    await this.auditSensitiveRead(actor, auditContext, 'view_financial', id);
    const countryNames = await this.getCountryNames([project.countryCode]);
    return this.toProjectResponse(
      { ...project, countryName: countryNames.get(project.countryCode) ?? null },
      actor,
    );
  }

  async generateProjectCode(countryCode: string, customerCode: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `${countryCode}-${customerCode}-${year}`;

    const lastProject = await this.prisma.project.findFirst({
      where: {
        projectCode: { startsWith: prefix },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { projectCode: true },
    });

    let seq = 1;
    if (lastProject) {
      const parts = lastProject.projectCode.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        seq = lastSeq + 1;
      }
    }

    return `${prefix}-${String(seq).padStart(3, '0')}`;
  }

  async create(dto: CreateProjectDto, actor: ProjectActor, rawIdempotencyKey: string) {
    const userId = this.requireUserId(actor);
    const idempotencyKey = validateProjectCreateIdempotencyKey(rawIdempotencyKey);
    const requestHash = hashProjectCreateRequest(dto);
    const existing = await this.findProjectByCreateIdempotencyKey(idempotencyKey);
    if (existing) {
      return this.resolveIdempotentProject(existing, userId, requestHash, actor);
    }

    this.assertSensitiveWriteAllowed(dto, actor);
    const customerCode = dto.customerName ? dto.customerName.substring(0, 2).toUpperCase() : 'XX';

    const projectCode = await this.generateProjectCode(dto.countryCode, customerCode);
    const amountData = await this.resolveAmountData(
      dto.contractAmount,
      dto.contractCurrency,
      dto.baseCurrency,
    );
    const deliveryStage = dto.deliveryStage ?? 'STARTUP';
    const riskLevel = dto.riskLevel ?? (await this.systemConfig.getDefaultProjectRiskLevel());
    const projectId = uuidv4();
    const preparedReview = await this.prepareProjectCreateReview(projectId, dto, userId);
    const initialLifecycleStatus = preparedReview ? 'DRAFT' : 'ACTIVE';

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: {
            id: projectId,
            projectCode,
            projectName: dto.projectName,
            shortName: dto.shortName,
            countryCode: dto.countryCode,
            city: dto.city,
            customerName: dto.customerName,
            projectType: dto.projectType,
            contractCurrency: dto.contractCurrency,
            baseCurrency: dto.baseCurrency,
            contractAmount: dto.contractAmount ?? undefined,
            contractNo: dto.contractNo,
            contractSignedAt: dto.contractSignedAt ? new Date(dto.contractSignedAt) : null,
            ...amountData,
            projectLanguage: dto.projectLanguage,
            salesOwnerId: dto.salesOwnerId,
            projectManagerId: dto.projectManagerId,
            electricLeaderId: dto.electricLeaderId,
            softwareLeaderId: dto.softwareLeaderId,
            purchaseOwnerId: dto.purchaseOwnerId,
            financeOwnerId: dto.financeOwnerId,
            status: initialLifecycleStatus,
            currentStage: deliveryStage,
            progressPercent:
              dto.progressPercent !== undefined
                ? new Prisma.Decimal(dto.progressPercent)
                : new Prisma.Decimal(0),
            riskLevel: riskLevel as RiskLevel,
            riskDescription: dto.riskDescription,
            startDate: dto.startDate ? new Date(dto.startDate) : null,
            plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null,
            expectedAcceptanceAt: dto.expectedAcceptanceAt
              ? new Date(dto.expectedAcceptanceAt)
              : null,
            createIdempotencyKey: idempotencyKey,
            createRequestHash: requestHash,
            revision: 1,
            createdBy: userId,
          },
        });
        await this.syncLeadershipMembers(tx, created.id, dto, userId);
        const archiveSnapshot = await this.projectArchiveSnapshot.createProjectSnapshot(
          tx,
          created.id,
          {
            projectType: dto.projectType,
            countryCode: dto.countryCode,
            languageCode: dto.projectLanguage,
            archiveTemplateId: dto.archiveTemplateId,
            archiveTemplateVersionId: dto.archiveTemplateVersionId,
          },
        );
        const reviewTaskId = preparedReview
          ? await this.reviewTasks.createPreparedTask(tx, preparedReview)
          : null;
        await tx.operationLog.create({
          data: {
            userId,
            module: 'project',
            action: 'create',
            targetType: 'project',
            targetId: created.id,
            result: 'success',
            afterData: {
              projectCode: created.projectCode,
              lifecycleStatus: initialLifecycleStatus,
              deliveryStage,
              archiveTemplateId: archiveSnapshot.templateId,
              archiveTemplateVersionId: archiveSnapshot.templateVersionId,
              archiveSnapshotSource: archiveSnapshot.source,
              archiveFolderCount: archiveSnapshot.folderCount,
              archiveItemCount: archiveSnapshot.itemCount,
              reviewTaskId,
            },
          },
        });
        await enqueueDomainEvent(tx, {
          eventType: 'ProjectCreated',
          aggregateType: 'project',
          aggregateId: created.id,
          deduplicationKey: `ProjectCreated:${created.id}`,
          payload: {
            projectId: created.id,
            projectCode: created.projectCode,
            createdBy: userId ?? null,
            archiveTemplateVersionId: archiveSnapshot.templateVersionId,
            reviewTaskId,
          },
        });
        return { created, reviewTaskId };
      });

      return this.findById(result.created.id, actor);
    } catch (error: unknown) {
      if (!this.isUniqueConstraintConflict(error)) throw error;
      const concurrentResult = await this.findProjectByCreateIdempotencyKey(idempotencyKey);
      if (!concurrentResult) throw error;
      return this.resolveIdempotentProject(concurrentResult, userId, requestHash, actor);
    }
  }

  private findProjectByCreateIdempotencyKey(
    idempotencyKey: string,
  ): Promise<IdempotentProject | null> {
    return this.prisma.project.findUnique({
      where: { createIdempotencyKey: idempotencyKey },
      select: idempotentProjectSelect,
    });
  }

  private async resolveIdempotentProject(
    project: IdempotentProject,
    userId: string,
    requestHash: string,
    actor: ProjectActor,
  ) {
    if (project.createdBy !== userId || project.createRequestHash !== requestHash) {
      throw new ConflictException('Idempotency-Key 已被其他项目创建请求使用');
    }
    return this.findById(project.id, actor);
  }

  private isUniqueConstraintConflict(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    return (error as { code?: unknown }).code === 'P2002';
  }

  private async prepareProjectCreateReview(
    projectId: string,
    dto: CreateProjectDto,
    submittedBy: string,
  ): Promise<PreparedReviewTask | null> {
    const templates = await this.prisma.approvalTemplate.findMany({
      where: {
        deletedAt: null,
        isEnabled: true,
        businessType: 'PROJECT_CREATE',
        ...(dto.approvalTemplateId
          ? { id: dto.approvalTemplateId }
          : { OR: [{ countryCode: dto.countryCode }, { countryCode: null }] }),
      },
      select: { id: true, countryCode: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (dto.approvalTemplateId && templates.length === 0) {
      throw new BadRequestException('指定的新建项目审批模板不存在、已停用或业务类型不匹配');
    }
    const template = dto.approvalTemplateId
      ? templates[0]
      : (templates.find((candidate) => candidate.countryCode === dto.countryCode) ??
        templates.find((candidate) => candidate.countryCode === null));
    if (!template) return null;

    const configuration = await this.reviewConfiguration.resolve(template.id, submittedBy);
    return this.reviewTasks.prepareTask({
      sourceType: 'PROJECT_CREATE',
      sourceId: projectId,
      sourceVersionId: projectId,
      projectId,
      approvalTemplateId: configuration.approvalTemplateId,
      approvalTemplateVersion: configuration.approvalTemplateVersion,
      approvalSnapshot: configuration.snapshot,
      title: `新建项目：${dto.projectName}`,
      locationLabel: dto.customerName
        ? `${dto.countryCode} / ${dto.customerName}`
        : dto.countryCode,
      reviewMode: configuration.reviewMode,
      submittedBy,
      steps: configuration.steps,
    });
  }

  async update(id: string, dto: UpdateProjectDto, actor: ProjectActor) {
    const userId = this.requireUserId(actor);
    this.assertSensitiveWriteAllowed(dto, actor);
    const projectScope = await this.projectAccess.buildProjectWhere(userId);
    const project = await this.prisma.project.findFirst({
      where: { ...projectScope, id },
    });

    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    this.assertProjectRevision(project.revision, dto.revision);

    const updateData: Prisma.ProjectUpdateInput = {};

    if (dto.projectName !== undefined) updateData.projectName = dto.projectName;
    if (dto.shortName !== undefined) updateData.shortName = dto.shortName;
    if (dto.countryCode !== undefined) updateData.countryCode = dto.countryCode;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.customerName !== undefined) updateData.customerName = dto.customerName;
    if (dto.projectType !== undefined) updateData.projectType = dto.projectType;
    if (dto.contractCurrency !== undefined) updateData.contractCurrency = dto.contractCurrency;
    if (dto.baseCurrency !== undefined) updateData.baseCurrency = dto.baseCurrency;
    if (dto.contractAmount !== undefined) updateData.contractAmount = dto.contractAmount;
    if (dto.contractNo !== undefined) updateData.contractNo = dto.contractNo;
    if (dto.contractSignedAt !== undefined) {
      updateData.contractSignedAt = dto.contractSignedAt ? new Date(dto.contractSignedAt) : null;
    }
    if (
      dto.contractAmount !== undefined ||
      dto.contractCurrency !== undefined ||
      dto.baseCurrency !== undefined
    ) {
      const amountData = await this.resolveAmountData(
        dto.contractAmount ?? project.contractAmount?.toNumber(),
        dto.contractCurrency ?? project.contractCurrency ?? undefined,
        dto.baseCurrency ?? project.baseCurrency ?? undefined,
      );
      Object.assign(updateData, amountData);
    }
    if (dto.projectLanguage !== undefined) updateData.projectLanguage = dto.projectLanguage;
    if (dto.salesOwnerId !== undefined) updateData.salesOwnerId = dto.salesOwnerId;
    if (dto.projectManagerId !== undefined) updateData.projectManagerId = dto.projectManagerId;
    if (dto.electricLeaderId !== undefined) updateData.electricLeaderId = dto.electricLeaderId;
    if (dto.softwareLeaderId !== undefined) updateData.softwareLeaderId = dto.softwareLeaderId;
    if (dto.purchaseOwnerId !== undefined) updateData.purchaseOwnerId = dto.purchaseOwnerId;
    if (dto.financeOwnerId !== undefined) updateData.financeOwnerId = dto.financeOwnerId;
    if (dto.riskLevel !== undefined) updateData.riskLevel = dto.riskLevel as RiskLevel;
    if (dto.progressPercent !== undefined) {
      updateData.progressPercent = new Prisma.Decimal(dto.progressPercent);
    }
    if (dto.riskDescription !== undefined) {
      updateData.riskDescription = dto.riskDescription;
    }
    if (dto.startDate !== undefined)
      updateData.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.plannedEndDate !== undefined)
      updateData.plannedEndDate = dto.plannedEndDate ? new Date(dto.plannedEndDate) : null;
    if (dto.expectedAcceptanceAt !== undefined) {
      updateData.expectedAcceptanceAt = dto.expectedAcceptanceAt
        ? new Date(dto.expectedAcceptanceAt)
        : null;
    }
    updateData.revision = { increment: 1 };

    await this.prisma.$transaction(async (tx) => {
      const updatedResult = await tx.project.updateMany({
        where: {
          id,
          deletedAt: null,
          revision: dto.revision,
          updatedAt: project.updatedAt,
        },
        data: updateData,
      });
      this.assertProjectCommandUpdated(updatedResult.count);
      await this.syncLeadershipMembers(tx, id, dto);
      const updated = await tx.project.findUniqueOrThrow({ where: { id } });
      await tx.operationLog.create({
        data: {
          userId,
          module: 'project',
          action: 'update',
          targetType: 'project',
          targetId: id,
          result: 'success',
          beforeData: this.projectUpdateAuditSnapshot(project),
          afterData: this.projectUpdateAuditSnapshot(updated),
        },
      });
    });
    return this.findById(id, actor);
  }

  async updateStage(id: string, dto: UpdateProjectStageDto, actor: ProjectActor) {
    const userId = this.requireUserId(actor);
    const scope = await this.projectAccess.buildProjectWhere(userId);
    const project = await this.prisma.project.findFirst({
      where: { ...scope, id },
      select: {
        id: true,
        currentStage: true,
        revision: true,
      },
    });
    if (!project) throw new NotFoundException('项目不存在');
    this.assertProjectRevision(project.revision, dto.revision);

    const currentStage = this.requireDeliveryStage(project.currentStage, project.id);
    const currentIndex = (PROJECT_DELIVERY_STAGES as readonly string[]).indexOf(currentStage);
    const targetIndex = PROJECT_DELIVERY_STAGES.indexOf(dto.targetStage);
    if (currentIndex >= 0 && targetIndex < currentIndex && !dto.reason?.trim()) {
      throw new BadRequestException('项目阶段回退必须填写原因');
    }
    await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.project.updateMany({
        where: {
          id,
          deletedAt: null,
          revision: dto.revision,
          currentStage: currentStage,
        },
        data: {
          currentStage: dto.targetStage,
          revision: { increment: 1 },
        },
      });
      this.assertProjectCommandUpdated(updateResult.count);
      await tx.operationLog.create({
        data: {
          userId,
          module: 'project',
          action: 'stage_update',
          targetType: 'project',
          targetId: id,
          result: 'success',
          beforeData: { stage: currentStage, revision: dto.revision },
          afterData: {
            stage: dto.targetStage,
            revision: dto.revision + 1,
            reason: dto.reason?.trim() ?? null,
          },
        },
      });
      await enqueueDomainEvent(tx, {
        eventType: 'ProjectStageChanged',
        aggregateType: 'project',
        aggregateId: id,
        payload: {
          projectId: id,
          previousStage: currentStage,
          targetStage: dto.targetStage,
          reason: dto.reason?.trim() ?? null,
          changedBy: userId,
          revision: dto.revision + 1,
        },
      });
    });
    return this.findById(id, actor);
  }

  async updateAcceptance(id: string, dto: UpdateProjectAcceptanceDto, actor: ProjectActor) {
    if (!dto.expectedAcceptanceAt && !dto.actualAcceptanceAt) {
      throw new BadRequestException('至少填写一个验收时间');
    }
    const userId = this.requireUserId(actor);
    const scope = await this.projectAccess.buildProjectWhere(userId);
    const project = await this.prisma.project.findFirst({
      where: { ...scope, id },
      select: {
        id: true,
        expectedAcceptanceAt: true,
        actualAcceptanceAt: true,
        status: true,
        revision: true,
      },
    });
    if (!project) throw new NotFoundException('项目不存在');
    this.assertProjectRevision(project.revision, dto.revision);

    const expectedAcceptanceAt = dto.expectedAcceptanceAt
      ? new Date(dto.expectedAcceptanceAt)
      : project.expectedAcceptanceAt;
    const actualAcceptanceAt = dto.actualAcceptanceAt
      ? new Date(dto.actualAcceptanceAt)
      : project.actualAcceptanceAt;
    const currentStatus = this.requireLifecycleStatus(project.status, project.id);
    await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.project.updateMany({
        where: {
          id,
          deletedAt: null,
          revision: dto.revision,
          status: currentStatus,
          expectedAcceptanceAt: project.expectedAcceptanceAt,
          actualAcceptanceAt: project.actualAcceptanceAt,
        },
        data: {
          expectedAcceptanceAt,
          actualAcceptanceAt,
          revision: { increment: 1 },
          ...(dto.actualAcceptanceAt
            ? {
                status: 'COMPLETED',
              }
            : {}),
        },
      });
      this.assertProjectCommandUpdated(updateResult.count);
      await tx.operationLog.create({
        data: {
          userId,
          module: 'project',
          action: 'acceptance_update',
          targetType: 'project',
          targetId: id,
          result: 'success',
          beforeData: {
            expectedAcceptanceAt: project.expectedAcceptanceAt?.toISOString() ?? null,
            actualAcceptanceAt: project.actualAcceptanceAt?.toISOString() ?? null,
            revision: dto.revision,
          },
          afterData: {
            expectedAcceptanceAt: expectedAcceptanceAt?.toISOString() ?? null,
            actualAcceptanceAt: actualAcceptanceAt?.toISOString() ?? null,
            revision: dto.revision + 1,
            reason: dto.reason?.trim() ?? null,
          },
        },
      });
      if (dto.actualAcceptanceAt) {
        await enqueueDomainEvent(tx, {
          eventType: 'ProjectAccepted',
          aggregateType: 'project',
          aggregateId: id,
          deduplicationKey: `ProjectAccepted:${id}:${new Date(dto.actualAcceptanceAt).toISOString()}`,
          payload: {
            projectId: id,
            actualAcceptanceAt: new Date(dto.actualAcceptanceAt).toISOString(),
            acceptedBy: userId,
            revision: dto.revision + 1,
          },
        });
      }
    });
    return this.findById(id, actor);
  }

  async changeStatus(
    id: string,
    command: ProjectStatusCommand,
    dto: ProjectStatusActionDto,
    actor: ProjectActor,
  ) {
    const userId = this.requireUserId(actor);
    const scope = await this.projectAccess.buildProjectWhere(userId);
    const project = await this.prisma.project.findFirst({
      where: { ...scope, id },
      select: {
        id: true,
        status: true,
        archivedAt: true,
        revision: true,
      },
    });
    if (!project) throw new NotFoundException('项目不存在');
    this.assertProjectRevision(project.revision, dto.revision);

    const currentStatus = this.requireLifecycleStatus(project.status, project.id);
    const now = new Date();
    const updateData: Prisma.ProjectUpdateManyMutationInput = {};
    let targetStatus = currentStatus;

    if (command === 'archive') {
      if (project.archivedAt) {
        throw new BadRequestException('项目已归档');
      }
      updateData.archivedAt = now;
    } else if (command === 'restore') {
      if (!project.archivedAt) {
        throw new BadRequestException('项目未归档');
      }
      updateData.archivedAt = null;
    } else {
      targetStatus = this.resolveStatusTransition(currentStatus, command);
      updateData.status = targetStatus;
    }
    updateData.revision = { increment: 1 };

    await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.project.updateMany({
        where: {
          id,
          deletedAt: null,
          revision: dto.revision,
          status: currentStatus,
          archivedAt: project.archivedAt,
        },
        data: updateData,
      });
      this.assertProjectCommandUpdated(updateResult.count);
      await tx.operationLog.create({
        data: {
          userId,
          module: 'project',
          action: command,
          targetType: 'project',
          targetId: id,
          result: 'success',
          beforeData: {
            lifecycleStatus: currentStatus,
            archivedAt: project.archivedAt?.toISOString() ?? null,
            revision: dto.revision,
          },
          afterData: {
            lifecycleStatus: targetStatus,
            archivedAt:
              command === 'archive'
                ? now.toISOString()
                : command === 'restore'
                  ? null
                  : (project.archivedAt?.toISOString() ?? null),
            revision: dto.revision + 1,
            reason: dto.reason?.trim() ?? null,
          },
        },
      });
      if (command === 'archive') {
        await enqueueDomainEvent(tx, {
          eventType: 'ProjectArchived',
          aggregateType: 'project',
          aggregateId: id,
          payload: {
            projectId: id,
            archivedBy: userId,
            reason: dto.reason?.trim() ?? null,
            revision: dto.revision + 1,
          },
        });
      }
    });
    return this.findById(id, actor);
  }

  private assertProjectCommandUpdated(count: number): void {
    if (count !== 1) {
      throw new ConflictException('项目已被其他请求更新，请刷新后重试');
    }
  }

  private assertProjectRevision(currentRevision: number, requestedRevision: number): void {
    if (currentRevision !== requestedRevision) {
      throw new ConflictException('项目已被其他请求更新，请刷新后重试');
    }
  }

  private projectUpdateAuditSnapshot(project: Project): Prisma.InputJsonObject {
    return {
      revision: project.revision,
      projectName: project.projectName,
      shortName: project.shortName,
      countryCode: project.countryCode,
      city: project.city,
      customerName: project.customerName,
      projectType: project.projectType,
      contractCurrency: project.contractCurrency,
      baseCurrency: project.baseCurrency,
      contractAmount: project.contractAmount?.toString() ?? null,
      contractNo: project.contractNo,
      contractSignedAt: project.contractSignedAt?.toISOString() ?? null,
      projectLanguage: project.projectLanguage,
      salesOwnerId: project.salesOwnerId,
      projectManagerId: project.projectManagerId,
      electricLeaderId: project.electricLeaderId,
      softwareLeaderId: project.softwareLeaderId,
      purchaseOwnerId: project.purchaseOwnerId,
      financeOwnerId: project.financeOwnerId,
      progressPercent: project.progressPercent?.toString() ?? null,
      riskLevel: project.riskLevel,
      riskDescription: project.riskDescription,
      startDate: project.startDate?.toISOString() ?? null,
      plannedEndDate: project.plannedEndDate?.toISOString() ?? null,
      expectedAcceptanceAt: project.expectedAcceptanceAt?.toISOString() ?? null,
    };
  }

  private async resolveAmountData(
    amount?: number,
    contractCurrency?: string,
    baseCurrency?: string,
  ): Promise<{
    exchangeRate?: Prisma.Decimal;
    convertedAmount?: Prisma.Decimal;
    exchangeRateDate?: Date;
    exchangeRateSource?: string;
  }> {
    if (amount === undefined) {
      return {};
    }
    if (!contractCurrency || !baseCurrency) {
      throw new BadRequestException('填写合同金额时必须选择原币和折算币种');
    }
    const originalAmount = new Prisma.Decimal(amount);
    if (contractCurrency === baseCurrency) {
      return {
        exchangeRate: new Prisma.Decimal(1),
        convertedAmount: originalAmount,
        exchangeRateDate: new Date(),
        exchangeRateSource: 'identity',
      };
    }
    const rate = await this.prisma.exchangeRate.findFirst({
      where: {
        fromCurrency: contractCurrency,
        toCurrency: baseCurrency,
        rateDate: { lte: new Date() },
      },
      select: { rate: true, rateDate: true, source: true },
      orderBy: { rateDate: 'desc' },
    });
    if (!rate) {
      throw new BadRequestException(`未配置 ${contractCurrency} 到 ${baseCurrency} 的有效汇率`);
    }
    return {
      exchangeRate: rate.rate,
      convertedAmount: originalAmount.mul(rate.rate),
      exchangeRateDate: rate.rateDate,
      exchangeRateSource: rate.source,
    };
  }

  async purge(id: string, actor?: ProjectActor): Promise<void> {
    if (typeof actor === 'string' || !actor?.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('仅超级管理员可物理删除项目');
    }

    const result = await this.prisma.$transaction(
      async (transaction) => {
        const project = await transaction.project.findUnique({
          where: { id },
          select: {
            id: true,
            projectCode: true,
            projectName: true,
            status: true,
          },
        });
        if (!project) throw new NotFoundException('项目不存在');

        const [archiveFileCount, legacyFileCount, reviewCount, paymentCount, auditCount] =
          await Promise.all([
            transaction.projectArchiveFile.count({ where: { projectId: id } }),
            transaction.file.count({ where: { projectId: id } }),
            transaction.reviewTask.count({ where: { projectId: id } }),
            transaction.projectPayment.count({ where: { projectId: id } }),
            transaction.operationLog.count({
              where: { targetType: 'project', targetId: id },
            }),
          ]);
        const blockers = {
          files: archiveFileCount + legacyFileCount,
          reviews: reviewCount,
          financialRecords: paymentCount,
          audits: auditCount,
        };

        if (Object.values(blockers).some((count) => count > 0)) {
          return { project, blockers };
        }

        await transaction.project.delete({ where: { id } });
        await transaction.operationLog.create({
          data: {
            userId: actor.sub,
            module: 'project',
            action: 'purge',
            targetType: 'project',
            targetId: id,
            beforeData: project,
            afterData: Prisma.JsonNull,
            result: 'success',
          },
        });
        return { project, blockers: null };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (result.blockers) {
      const reason = [
        `文件 ${result.blockers.files} 条`,
        `审核 ${result.blockers.reviews} 条`,
        `财务 ${result.blockers.financialRecords} 条`,
        `审计 ${result.blockers.audits} 条`,
      ].join('、');
      await this.prisma.operationLog.create({
        data: {
          userId: actor.sub,
          module: 'project',
          action: 'purge',
          targetType: 'project',
          targetId: id,
          beforeData: result.project,
          afterData: result.blockers,
          result: 'failure',
          errorReason: `物理删除被依赖记录阻止：${reason}`,
        },
      });
      throw new ConflictException(`项目存在关联记录，禁止物理删除：${reason}`);
    }
  }

  private async syncLeadershipMembers(
    client: Pick<Prisma.TransactionClient, 'projectMember'>,
    projectId: string,
    dto: Partial<CreateProjectDto & UpdateProjectDto>,
    creatorId?: string,
  ): Promise<void> {
    const assignments = [
      [dto.salesOwnerId, 'SALES_OWNER'],
      [dto.projectManagerId, 'PROJECT_MANAGER'],
      [dto.electricLeaderId, 'ELEC_LEADER'],
      [dto.softwareLeaderId, 'SOFTWARE_LEADER'],
      [dto.purchaseOwnerId, 'PURCHASE'],
      [dto.financeOwnerId, 'FINANCE'],
      [creatorId, 'PROJECT_MANAGER'],
    ] as const;
    for (const [assignedUserId, projectRole] of assignments) {
      if (!assignedUserId) continue;
      await client.projectMember.upsert({
        where: {
          projectId_userId: { projectId, userId: assignedUserId },
        },
        create: {
          projectId,
          userId: assignedUserId,
          projectRole,
        },
        update: { projectRole, deletedAt: null },
      });
    }
  }

  private getUserId(actor?: ProjectActor): string | undefined {
    return typeof actor === 'string' ? actor : actor?.sub;
  }

  private requireUserId(actor: ProjectActor): string {
    const userId = this.getUserId(actor);
    if (!userId) throw new ForbiddenException('缺少用户上下文');
    return userId;
  }

  private buildSummaryFilterWhere(
    filter: Exclude<ProjectSummaryFilter, 'ALL'>,
  ): Prisma.ProjectWhereInput {
    if (filter === 'ACTIVE') {
      return { status: 'ACTIVE', archivedAt: null };
    }
    if (filter === 'ACCEPTED') {
      return { actualAcceptanceAt: { not: null } };
    }
    return { riskLevel: { in: [RiskLevel.High, RiskLevel.Critical] } };
  }

  private resolveProjectOrderBy(sort?: string): Prisma.ProjectOrderByWithRelationInput {
    switch (sort) {
      case 'updatedAt:asc':
        return { updatedAt: 'asc' };
      case 'projectName:asc':
        return { projectName: 'asc' };
      case 'projectName:desc':
        return { projectName: 'desc' };
      default:
        return { updatedAt: 'desc' };
    }
  }

  private async getCountryNames(countryCodes: string[]): Promise<Map<string, string>> {
    const uniqueCodes = [...new Set(countryCodes.filter(Boolean))];
    if (uniqueCodes.length === 0) return new Map();
    const countries = await this.prisma.country.findMany({
      where: { countryCode: { in: uniqueCodes }, status: 'Active' },
      select: { countryCode: true, nameZh: true },
    });
    return new Map(countries.map((country) => [country.countryCode, country.nameZh]));
  }

  private requireDeliveryStage(value: string | null, projectId: string): ProjectDeliveryStage {
    if ((PROJECT_DELIVERY_STAGES as readonly string[]).includes(value ?? '')) {
      return value as ProjectDeliveryStage;
    }
    throw new BadRequestException(`项目 ${projectId} 尚未完成目标阶段迁移`);
  }

  private requireLifecycleStatus(value: string | null, projectId: string): ProjectLifecycleStatus {
    if (['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'].includes(value ?? '')) {
      return value as ProjectLifecycleStatus;
    }
    throw new BadRequestException(`项目 ${projectId} 尚未完成目标状态迁移`);
  }

  private resolveStatusTransition(
    current: ProjectLifecycleStatus,
    command: Exclude<ProjectStatusCommand, 'archive' | 'restore'>,
  ): ProjectLifecycleStatus {
    const allowed: Record<
      Exclude<ProjectStatusCommand, 'archive' | 'restore'>,
      { from: ProjectLifecycleStatus[]; to: ProjectLifecycleStatus }
    > = {
      pause: { from: ['ACTIVE'], to: 'PAUSED' },
      resume: { from: ['PAUSED'], to: 'ACTIVE' },
      complete: { from: ['ACTIVE', 'PAUSED'], to: 'COMPLETED' },
      cancel: { from: ['DRAFT', 'ACTIVE', 'PAUSED'], to: 'CANCELLED' },
    };
    const transition = allowed[command];
    if (!transition.from.includes(current)) {
      throw new BadRequestException(`项目状态 ${current} 不允许执行 ${command}`);
    }
    return transition.to;
  }

  private canViewFinancial(actor?: ProjectActor): boolean {
    if (!actor || typeof actor === 'string') return false;
    return (
      actor.roles.includes('SUPER_ADMIN') || actor.permissions.includes('project:view_financial')
    );
  }

  private canViewContract(actor?: ProjectActor): boolean {
    if (!actor || typeof actor === 'string') return false;
    return (
      actor.roles.includes('SUPER_ADMIN') || actor.permissions.includes('project:view_contract')
    );
  }

  private canViewAcceptance(actor?: ProjectActor): boolean {
    if (!actor || typeof actor === 'string') return false;
    return (
      actor.roles.includes('SUPER_ADMIN') || actor.permissions.includes('project:view_acceptance')
    );
  }

  private assertSensitiveWriteAllowed(
    dto: Pick<
      CreateProjectDto,
      | 'contractCurrency'
      | 'baseCurrency'
      | 'contractAmount'
      | 'contractNo'
      | 'contractSignedAt'
      | 'expectedAcceptanceAt'
    >,
    actor?: ProjectActor,
  ): void {
    const includesFinancialData =
      dto.contractCurrency !== undefined ||
      dto.baseCurrency !== undefined ||
      dto.contractAmount !== undefined;
    if (includesFinancialData && actor && !this.canViewFinancial(actor)) {
      throw new ForbiddenException('无权设置项目财务信息');
    }
    const includesContractData = dto.contractNo !== undefined || dto.contractSignedAt !== undefined;
    if (includesContractData && actor && !this.canViewContract(actor)) {
      throw new ForbiddenException('无权设置项目合同信息');
    }
    if (dto.expectedAcceptanceAt !== undefined && actor && !this.canViewAcceptance(actor)) {
      throw new ForbiddenException('无权设置项目验收信息');
    }
  }

  private async auditSensitiveRead(
    actor: ProjectActor | undefined,
    context: ProjectReadAuditContext | undefined,
    action: string,
    targetId: string | undefined,
    afterData?: Prisma.JsonObject,
  ): Promise<void> {
    if (
      !context ||
      !targetId ||
      !actor ||
      typeof actor === 'string' ||
      !(
        this.canViewFinancial(actor) ||
        this.canViewContract(actor) ||
        this.canViewAcceptance(actor)
      )
    ) {
      return;
    }
    await this.prisma.operationLog.create({
      data: {
        userId: actor.sub,
        module: 'project',
        action,
        targetType: 'project',
        targetId,
        ipAddress: context.ipAddress?.slice(0, 50),
        userAgent: context.userAgent?.slice(0, 500),
        result: 'success',
        afterData,
      },
    });
  }

  private toProjectResponse<
    T extends {
      id: string;
      status: string | null;
      currentStage: string | null;
      contractCurrency: string | null;
      baseCurrency: string | null;
      contractAmount: Prisma.Decimal | null;
      exchangeRate: Prisma.Decimal | null;
      convertedAmount: Prisma.Decimal | null;
      exchangeRateDate: Date | null;
      exchangeRateSource: string | null;
      contractNo: string | null;
      contractSignedAt: Date | null;
      expectedAcceptanceAt: Date | null;
      actualAcceptanceAt: Date | null;
      progressPercent: Prisma.Decimal | null;
    },
  >(project: T, actor?: ProjectActor) {
    const {
      contractCurrency,
      baseCurrency,
      contractAmount,
      exchangeRate,
      convertedAmount,
      exchangeRateDate,
      exchangeRateSource,
      contractNo,
      contractSignedAt,
      expectedAcceptanceAt,
      actualAcceptanceAt,
      progressPercent,
      status,
      currentStage,
      ...publicFields
    } = project;

    const canViewFinancial = this.canViewFinancial(actor);
    const canViewContract = this.canViewContract(actor);
    const canViewAcceptance = this.canViewAcceptance(actor);
    const visibleExpectedAcceptanceAt = canViewAcceptance ? expectedAcceptanceAt : null;
    const visibleActualAcceptanceAt = canViewAcceptance ? actualAcceptanceAt : null;
    const acceptanceTimeType: ProjectListItem['acceptanceTimeType'] = visibleActualAcceptanceAt
      ? 'ACTUAL'
      : visibleExpectedAcceptanceAt
        ? 'EXPECTED'
        : 'NONE';
    return {
      ...publicFields,
      status: this.requireLifecycleStatus(status, project.id),
      currentStage: this.requireDeliveryStage(currentStage, project.id),
      progressPercent: progressPercent?.toNumber() ?? null,
      contractCurrency: canViewFinancial ? contractCurrency : null,
      baseCurrency: canViewFinancial ? baseCurrency : null,
      contractAmount: canViewFinancial ? (contractAmount?.toNumber() ?? null) : null,
      exchangeRate: canViewFinancial ? (exchangeRate?.toNumber() ?? null) : null,
      convertedAmount: canViewFinancial ? (convertedAmount?.toNumber() ?? null) : null,
      exchangeRateDate: canViewFinancial ? exchangeRateDate : null,
      exchangeRateSource: canViewFinancial ? exchangeRateSource : null,
      contractNo: canViewContract ? contractNo : null,
      contractSignedAt: canViewContract ? contractSignedAt : null,
      expectedAcceptanceAt: visibleExpectedAcceptanceAt,
      actualAcceptanceAt: visibleActualAcceptanceAt,
      acceptanceTimeType,
    };
  }

}
