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
import { UpdateProjectProgressDto } from './dto/update-project-progress.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectAccessService } from './project-access.service';
import { ProjectConfigurationService } from './project-configuration.service';
import {
  hashProjectCreateRequest,
  validateProjectCreateIdempotencyKey,
} from './project-create-idempotency';
import {
  PROJECT_DELIVERY_STAGES,
  type ProjectDeliveryStage,
  type ProjectLifecycleStatus,
  type ProjectSummaryFilter,
  type ProjectScope,
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
  contractType: string | null;
  product: string | null;
  keywords: string[];
  contractCurrency?: string | null;
  baseCurrency?: string | null;
  contractAmount?: number | null;
  exchangeRate?: number | null;
  convertedAmount?: number | null;
  exchangeRateDate?: Date | null;
  exchangeRateSource?: string | null;
  projectLanguage: string | null;
  salesOwnerId: string | null;
  projectManagerId: string | null;
  electricalOwnerId: string | null;
  softwareOwnerId: string | null;
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
  archivedAt: Date | null;
  archivedBy: string | null;
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
    private readonly projectConfiguration: ProjectConfigurationService,
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
      scope: requestedScope = 'mine',
      lifecycleStatus,
      countryCode,
      projectType,
      summaryFilter,
      sort,
    } = query;
    const pageSize = requestedPageSize ?? (await this.systemConfig.getDefaultProjectPageSize());

    const allowedScope: Prisma.ProjectWhereInput = userId
      ? await this.projectAccess.buildProjectWhere(userId)
      : { deletedAt: null };
    const scope = this.buildRequestedScope(allowedScope, requestedScope, userId);
    const filters: Prisma.ProjectWhereInput[] = [];

    if (keyword) {
      filters.push({
        OR: [
          { projectName: { contains: keyword } },
          { shortName: { contains: keyword } },
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
      AND: [scope, { archivedAt: null }, ...filters],
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
          contractType: true,
          product: true,
          keywords: true,
          contractCurrency: true,
          baseCurrency: true,
          contractAmount: true,
          exchangeRate: true,
          convertedAmount: true,
          exchangeRateDate: true,
          exchangeRateSource: true,
          projectLanguage: true,
          salesOwnerId: true,
          projectManagerId: true,
          electricalOwnerId: true,
          softwareOwnerId: true,
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
          archivedAt: true,
          archivedBy: true,
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
        scope: requestedScope,
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

  async findArchived(
    query: QueryProjectDto,
    actor: ProjectActor,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const userId = this.requireUserId(actor);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? (await this.systemConfig.getDefaultProjectPageSize());
    const allowedScope = await this.projectAccess.buildProjectWhere(userId);
    const keywordFilter: Prisma.ProjectWhereInput = query.keyword
      ? {
          OR: [
            { projectName: { contains: query.keyword } },
            { shortName: { contains: query.keyword } },
            { projectCode: { contains: query.keyword } },
            { customerName: { contains: query.keyword } },
          ],
        }
      : {};
    const where: Prisma.ProjectWhereInput = {
      AND: [allowedScope, { archivedAt: { not: null } }, keywordFilter],
    };
    const [total, projects] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        include: {
          members: {
            where: { deletedAt: null },
            include: {
              user: { select: { id: true, username: true, realName: true } },
            },
          },
        },
        orderBy: { archivedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const countryNames = await this.getCountryNames(projects.map((project) => project.countryCode));
    const archivedByIds = projects
      .map((project) => project.archivedBy)
      .filter((id): id is string => Boolean(id));
    const archivedUsers = await this.prisma.user.findMany({
      where: { id: { in: archivedByIds } },
      select: { id: true, username: true, realName: true },
    });
    const archivedUserById = new Map(archivedUsers.map((user) => [user.id, user]));
    return {
      items: projects.map((project) => ({
        ...this.toProjectResponse(
          { ...project, countryName: countryNames.get(project.countryCode) ?? null },
          actor,
        ),
        archivedByUser: project.archivedBy
          ? (archivedUserById.get(project.archivedBy) ?? null)
          : null,
      })),
      page,
      pageSize,
      total,
    };
  }

  async getSummary(
    actor: ProjectActor,
    requestedScope: ProjectScope = 'mine',
  ): Promise<{
    total: number;
    active: number;
    accepted: number;
    acceptedThisYear: number;
    highRisk: number;
    totalConvertedAmount: number | null;
    acceptedConvertedAmount: number | null;
  }> {
    const userId = this.getUserId(actor);
    if (!userId) {
      throw new ForbiddenException('缺少用户上下文');
    }
    const allowedScope = await this.projectAccess.buildProjectWhere(userId);
    const scope = this.buildRequestedScope(allowedScope, requestedScope, userId);
    const activeScope: Prisma.ProjectWhereInput = { AND: [scope, { archivedAt: null }] };
    const currentYear = new Date().getUTCFullYear();
    const acceptedThisYearWhere: Prisma.ProjectWhereInput = {
      actualAcceptanceAt: {
        gte: new Date(Date.UTC(currentYear, 0, 1)),
        lt: new Date(Date.UTC(currentYear + 1, 0, 1)),
      },
    };
    const [total, active, accepted, acceptedThisYear, highRisk, totalAmount, acceptedAmount] =
      await Promise.all([
        this.prisma.project.count({ where: activeScope }),
        this.prisma.project.count({
          where: {
            AND: [activeScope, this.buildSummaryFilterWhere('ACTIVE')],
          },
        }),
        this.prisma.project.count({
          where: {
            AND: [activeScope, this.buildSummaryFilterWhere('ACCEPTED')],
          },
        }),
        this.prisma.project.count({ where: { AND: [activeScope, acceptedThisYearWhere] } }),
        this.prisma.project.count({
          where: {
            AND: [activeScope, this.buildSummaryFilterWhere('HIGH_RISK')],
          },
        }),
        this.prisma.project.aggregate({
          where: activeScope,
          _sum: { convertedAmount: true },
        }),
        this.prisma.projectPayment.aggregate({
          where: {
            deletedAt: null,
            project: activeScope,
          },
          _sum: { receivedConvertedAmount: true },
        }),
      ]);
    const canViewFinancial = this.canViewFinancial(actor);
    return {
      total,
      active,
      accepted,
      acceptedThisYear,
      highRisk,
      totalConvertedAmount: canViewFinancial
        ? (totalAmount._sum.convertedAmount?.toNumber() ?? 0)
        : null,
      acceptedConvertedAmount: canViewFinancial
        ? (acceptedAmount._sum.receivedConvertedAmount?.toNumber() ?? 0)
        : null,
    };
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
        processRecords: {
          where: { deletedAt: null },
          orderBy: { recordDate: 'desc' },
          take: 10,
          select: {
            id: true,
            title: true,
            description: true,
            stageCode: true,
            recordDate: true,
            createdBy: true,
          },
        },
        archiveEntries: {
          where: { archivedAt: null },
          select: {
            required: true,
            files: { where: { archivedAt: null }, select: { id: true } },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    await this.auditSensitiveRead(actor, auditContext, 'view_financial', id);
    const countryNames = await this.getCountryNames([project.countryCode]);
    const { archiveEntries: completionEntries = [], ...projectFields } = project;
    const archiveCompletion = {
      total: completionEntries.length,
      completed: completionEntries.filter((entry) => entry.files.length > 0).length,
      requiredTotal: completionEntries.filter((entry) => entry.required).length,
      requiredCompleted: completionEntries.filter(
        (entry) => entry.required && entry.files.length > 0,
      ).length,
    };
    return {
      ...this.toProjectResponse(
        { ...projectFields, countryName: countryNames.get(project.countryCode) ?? null },
        actor,
      ),
      archiveCompletion,
      recentActivities: project.processRecords ?? [],
    };
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
    await this.projectConfiguration.validate(dto);
    const customerCode = dto.customerName ? dto.customerName.substring(0, 2).toUpperCase() : 'XX';

    const projectCode = await this.generateProjectCode(dto.countryCode, customerCode);
    const contractAmount =
      dto.contractAmount === undefined
        ? undefined
        : new Prisma.Decimal(dto.contractAmount).toDecimalPlaces(2);
    const amountData = await this.resolveAmountData(
      contractAmount,
      dto.contractCurrency,
      dto.baseCurrency,
    );
    const deliveryStage = dto.deliveryStage ?? 'STARTUP';
    const riskLevel = dto.riskLevel ?? (await this.systemConfig.getDefaultProjectRiskLevel());
    const projectId = uuidv4();
    const preparedReview = dto.saveAsDraft
      ? null
      : await this.prepareProjectCreateReview(projectId, dto, userId);
    const initialLifecycleStatus = dto.saveAsDraft || preparedReview ? 'DRAFT' : 'ACTIVE';

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
            contractType: dto.contractType,
            product: dto.product,
            keywords: dto.keywords ?? Prisma.JsonNull,
            contractCurrency: dto.contractCurrency,
            baseCurrency: dto.baseCurrency,
            contractAmount,
            contractNo: dto.contractNo,
            contractSignedAt: dto.contractSignedAt ? new Date(dto.contractSignedAt) : null,
            ...amountData,
            projectLanguage: dto.projectLanguage,
            salesOwnerId: dto.salesOwnerId,
            projectManagerId: dto.projectManagerId,
            electricalOwnerId: dto.electricalOwnerId,
            softwareOwnerId: dto.softwareOwnerId,
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
        await this.syncLeadershipMembers(tx, created.id, dto);
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
    await this.projectConfiguration.validate(dto);

    const updateData: Prisma.ProjectUpdateInput = {};

    if (dto.projectName !== undefined) updateData.projectName = dto.projectName;
    if (dto.shortName !== undefined) updateData.shortName = dto.shortName;
    if (dto.countryCode !== undefined) updateData.countryCode = dto.countryCode;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.customerName !== undefined) updateData.customerName = dto.customerName;
    if (dto.projectType !== undefined) updateData.projectType = dto.projectType;
    if (dto.contractType !== undefined) updateData.contractType = dto.contractType;
    if (dto.product !== undefined) updateData.product = dto.product;
    if (dto.keywords !== undefined) updateData.keywords = dto.keywords;
    if (dto.contractCurrency !== undefined) updateData.contractCurrency = dto.contractCurrency;
    if (dto.baseCurrency !== undefined) updateData.baseCurrency = dto.baseCurrency;
    const contractAmount =
      dto.contractAmount === undefined
        ? undefined
        : new Prisma.Decimal(dto.contractAmount).toDecimalPlaces(2);
    if (contractAmount !== undefined) updateData.contractAmount = contractAmount;
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
        contractAmount ?? project.contractAmount ?? undefined,
        dto.contractCurrency ?? project.contractCurrency ?? undefined,
        dto.baseCurrency ?? project.baseCurrency ?? undefined,
      );
      Object.assign(updateData, amountData);
    }
    if (dto.projectLanguage !== undefined) updateData.projectLanguage = dto.projectLanguage;
    if (dto.salesOwnerId !== undefined) updateData.salesOwnerId = dto.salesOwnerId;
    if (dto.projectManagerId !== undefined) updateData.projectManagerId = dto.projectManagerId;
    if (dto.electricalOwnerId !== undefined) updateData.electricalOwnerId = dto.electricalOwnerId;
    if (dto.softwareOwnerId !== undefined) updateData.softwareOwnerId = dto.softwareOwnerId;
    if (dto.riskLevel !== undefined) updateData.riskLevel = dto.riskLevel as RiskLevel;
    if (dto.riskDescription !== undefined) {
      updateData.riskDescription = dto.riskDescription;
    }
    if (dto.startDate !== undefined)
      updateData.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.plannedEndDate !== undefined)
      updateData.plannedEndDate = dto.plannedEndDate ? new Date(dto.plannedEndDate) : null;
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

  async updateProgress(id: string, dto: UpdateProjectProgressDto, actor: ProjectActor) {
    this.assertProgressPermission(actor);
    const userId = this.requireUserId(actor);
    const scope = await this.projectAccess.buildProjectWhere(userId);
    const project = await this.prisma.project.findFirst({
      where: { ...scope, id, archivedAt: null },
      select: {
        id: true,
        currentStage: true,
        progressPercent: true,
        expectedAcceptanceAt: true,
        actualAcceptanceAt: true,
        status: true,
        revision: true,
      },
    });
    if (!project) throw new NotFoundException('项目不存在或已归档');
    this.assertProjectRevision(project.revision, dto.revision);

    const currentStage = this.requireDeliveryStage(project.currentStage, project.id);
    const currentIndex = PROJECT_DELIVERY_STAGES.indexOf(currentStage);
    const targetIndex = PROJECT_DELIVERY_STAGES.indexOf(dto.targetStage);
    if (targetIndex < currentIndex && !dto.reason?.trim()) {
      throw new BadRequestException('项目阶段回退必须填写变更说明');
    }
    const expectedAcceptanceAt = dto.expectedAcceptanceAt
      ? new Date(dto.expectedAcceptanceAt)
      : project.expectedAcceptanceAt;
    const actualAcceptanceAt = dto.actualAcceptanceAt
      ? new Date(dto.actualAcceptanceAt)
      : project.actualAcceptanceAt;
    const becameAccepted = Boolean(dto.actualAcceptanceAt && !project.actualAcceptanceAt);

    await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.project.updateMany({
        where: { id, revision: dto.revision, archivedAt: null },
        data: {
          currentStage: dto.targetStage,
          progressPercent: new Prisma.Decimal(dto.progressPercent),
          expectedAcceptanceAt,
          actualAcceptanceAt,
          ...(dto.actualAcceptanceAt ? { status: 'COMPLETED' } : {}),
          revision: { increment: 1 },
        },
      });
      this.assertProjectCommandUpdated(updateResult.count);
      await tx.projectProcessRecord.create({
        data: {
          projectId: id,
          title: '项目进度更新',
          recordType: 'Progress',
          stageCode: dto.targetStage,
          recordDate: new Date(),
          description: dto.reason?.trim() || `项目进度调整为 ${dto.progressPercent}%`,
          createdBy: userId,
        },
      });
      await tx.operationLog.create({
        data: {
          userId,
          module: 'project',
          action: 'progress_update',
          targetType: 'project',
          targetId: id,
          result: 'success',
          beforeData: {
            stage: currentStage,
            progressPercent: project.progressPercent?.toString() ?? null,
            expectedAcceptanceAt: project.expectedAcceptanceAt?.toISOString() ?? null,
            actualAcceptanceAt: project.actualAcceptanceAt?.toISOString() ?? null,
            revision: dto.revision,
          },
          afterData: {
            stage: dto.targetStage,
            progressPercent: dto.progressPercent,
            expectedAcceptanceAt: expectedAcceptanceAt?.toISOString() ?? null,
            actualAcceptanceAt: actualAcceptanceAt?.toISOString() ?? null,
            reason: dto.reason?.trim() ?? null,
            revision: dto.revision + 1,
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
          progressPercent: dto.progressPercent,
          reason: dto.reason?.trim() ?? null,
          changedBy: userId,
          revision: dto.revision + 1,
        },
      });
      if (becameAccepted && actualAcceptanceAt) {
        await enqueueDomainEvent(tx, {
          eventType: 'ProjectAccepted',
          aggregateType: 'project',
          aggregateId: id,
          deduplicationKey: `ProjectAccepted:${id}:${actualAcceptanceAt.toISOString()}`,
          payload: {
            projectId: id,
            actualAcceptanceAt: actualAcceptanceAt.toISOString(),
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
        createdBy: true,
        projectManagerId: true,
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
      if (!this.canArchiveProject(project, actor)) {
        throw new ForbiddenException('仅管理员或该项目的创建者项目经理可归档项目');
      }
      if (project.archivedAt) {
        throw new BadRequestException('项目已归档');
      }
      updateData.archivedAt = now;
      updateData.archivedBy = userId;
    } else if (command === 'restore') {
      if (!this.canRestoreProject(actor)) {
        throw new ForbiddenException('无权恢复归档项目');
      }
      if (!project.archivedAt) {
        throw new BadRequestException('项目未归档');
      }
      updateData.archivedAt = null;
      updateData.archivedBy = null;
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
      contractType: project.contractType,
      product: project.product,
      keywords: Array.isArray(project.keywords)
        ? project.keywords.filter((keyword): keyword is string => typeof keyword === 'string')
        : [],
      contractCurrency: project.contractCurrency,
      baseCurrency: project.baseCurrency,
      contractAmount: project.contractAmount?.toString() ?? null,
      contractNo: project.contractNo,
      contractSignedAt: project.contractSignedAt?.toISOString() ?? null,
      projectLanguage: project.projectLanguage,
      salesOwnerId: project.salesOwnerId,
      projectManagerId: project.projectManagerId,
      electricalOwnerId: project.electricalOwnerId,
      softwareOwnerId: project.softwareOwnerId,
      progressPercent: project.progressPercent?.toString() ?? null,
      riskLevel: project.riskLevel,
      riskDescription: project.riskDescription,
      startDate: project.startDate?.toISOString() ?? null,
      plannedEndDate: project.plannedEndDate?.toISOString() ?? null,
      expectedAcceptanceAt: project.expectedAcceptanceAt?.toISOString() ?? null,
    };
  }

  private async resolveAmountData(
    amount?: number | Prisma.Decimal,
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
    const originalAmount = new Prisma.Decimal(amount).toDecimalPlaces(2);
    if (contractCurrency === baseCurrency) {
      return {
        exchangeRate: new Prisma.Decimal(1),
        convertedAmount: originalAmount.toDecimalPlaces(2),
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
      convertedAmount: originalAmount.mul(rate.rate).toDecimalPlaces(2),
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
            archivedAt: true,
          },
        });
        if (!project) throw new NotFoundException('项目不存在');
        if (!project.archivedAt) {
          throw new BadRequestException('仅已归档项目可永久删除');
        }

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
  ): Promise<void> {
    const assignments = [
      [dto.salesOwnerId, 'SALES_OWNER'],
      [dto.projectManagerId, 'PROJECT_MANAGER'],
      [dto.electricalOwnerId, 'ELEC_LEADER'],
      [dto.softwareOwnerId, 'SOFTWARE_LEADER'],
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

  private buildRequestedScope(
    allowedScope: Prisma.ProjectWhereInput,
    requestedScope: ProjectScope,
    userId?: string,
  ): Prisma.ProjectWhereInput {
    if (requestedScope === 'all') return allowedScope;
    if (!userId) return { AND: [allowedScope, { id: { in: [] } }] };
    return {
      AND: [
        allowedScope,
        {
          OR: [
            { salesOwnerId: userId },
            { projectManagerId: userId },
            { electricalOwnerId: userId },
            { softwareOwnerId: userId },
            { members: { some: { userId, deletedAt: null } } },
          ],
        },
      ],
    };
  }

  private isSuperAdmin(actor?: ProjectActor): boolean {
    return Boolean(actor && typeof actor !== 'string' && actor.roles.includes('SUPER_ADMIN'));
  }

  private hasPermission(actor: ProjectActor | undefined, permission: string): boolean {
    return Boolean(
      actor &&
      typeof actor !== 'string' &&
      (this.isSuperAdmin(actor) || actor.permissions.includes(permission)),
    );
  }

  private canArchiveProject(
    project: { createdBy: string | null; projectManagerId: string | null },
    actor?: ProjectActor,
  ): boolean {
    if (!actor || typeof actor === 'string') return false;
    return (
      this.isSuperAdmin(actor) ||
      (project.createdBy === actor.sub && project.projectManagerId === actor.sub)
    );
  }

  private canRestoreProject(actor?: ProjectActor): boolean {
    return this.hasPermission(actor, 'project:restore');
  }

  private assertProgressPermission(actor: ProjectActor): void {
    if (!this.hasPermission(actor, 'project:progress:update')) {
      throw new ForbiddenException('无权修改项目进度');
    }
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
    if (filter === 'ACCEPTED_THIS_YEAR') {
      const year = new Date().getUTCFullYear();
      return {
        actualAcceptanceAt: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      };
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
      keywords: Prisma.JsonValue | null;
      createdBy: string | null;
      projectManagerId: string | null;
      archivedAt: Date | null;
      projectName: string;
      city: string | null;
      countryName?: string | null;
      members?: Array<{
        projectRole: string;
        user: { id: string; username: string; realName: string };
      }>;
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
      keywords,
      status,
      currentStage,
      ...publicFields
    } = project;

    const canViewFinancial = this.canViewFinancial(actor);
    const canViewContract = this.canViewContract(actor);
    const canViewAcceptance = this.canViewAcceptance(actor);
    const salesOwner =
      project.members?.find((member) => member.projectRole === 'SALES_OWNER')?.user ?? null;
    const projectManager =
      project.members?.find((member) => member.projectRole === 'PROJECT_MANAGER')?.user ?? null;
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
      name: project.projectName,
      cityName: project.city,
      currencyCode: canViewFinancial ? contractCurrency : null,
      convertedCnyAmount: canViewFinancial ? (convertedAmount?.toNumber() ?? null) : null,
      salesOwner,
      projectManager,
      keywords: Array.isArray(keywords)
        ? keywords.filter((keyword): keyword is string => typeof keyword === 'string')
        : [],
      canEdit: this.hasPermission(actor, 'project:update'),
      canUpdateProgress: this.hasPermission(actor, 'project:progress:update'),
      canArchive: !project.archivedAt && this.canArchiveProject(project, actor),
      canRestore: Boolean(project.archivedAt) && this.canRestoreProject(actor),
      canPermanentDelete: Boolean(project.archivedAt) && this.isSuperAdmin(actor),
    };
  }
}
