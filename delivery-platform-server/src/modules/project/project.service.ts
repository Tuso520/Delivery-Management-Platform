import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, RiskLevel, type Project } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { enqueueDomainEvent } from '../../common/events/outbox';
import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { FieldConfigurationService } from '../field-configuration/field-configuration.service';
import { writeOperationLog } from '../operation-log/operation-log.service';
import { ProjectArchiveSnapshotService } from '../project-archive/project-archive-snapshot.service';
import { ReviewConfigurationService } from '../review/review-configuration.service';
import { type PreparedReviewTask, ReviewTaskService } from '../review/review-task.service';
import { SystemConfigService } from '../system-config/system-config.service';

import {
  CreateProjectDto,
  type ProjectPaymentPlanWriteDto,
} from './dto/create-project.dto';
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
  type ProjectDeliveryStage,
  type ProjectLifecycleStatus,
  type ProjectScope,
} from './project.constants';

type ProjectActor = Pick<JwtPayload, 'sub' | 'permissions' | 'roles'> | string;
type ProjectStatusCommand = 'pause' | 'resume' | 'complete' | 'cancel' | 'archive' | 'restore';

interface PreparedProjectPaymentPlan {
  id?: string;
  paymentName: string;
  paymentType: string;
  dueDate: Date | null;
  receivedDate: Date | null;
  status: string;
  originalAmount: Prisma.Decimal;
  originalCurrency: string;
  exchangeRate: Prisma.Decimal;
  convertedCurrency: string;
  convertedAmount: Prisma.Decimal;
  receivedOriginalAmount: Prisma.Decimal;
  receivedConvertedAmount: Prisma.Decimal;
  rateDate: Date;
  rateSource: string;
  remark?: string;
}

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
  customerType: string | null;
  projectType: string | null;
  contractType: string | null;
  product: string | null;
  keywords: string[];
  contractCurrency?: string | null;
  baseCurrency?: string | null;
  contractAmount?: string | null;
  exchangeRate?: string | null;
  convertedAmount?: string | null;
  acceptedConvertedAmount?: string | null;
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
  currentStages: ProjectDeliveryStage[];
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
    private readonly reviewConfiguration: ReviewConfigurationService,
    private readonly reviewTasks: ReviewTaskService,
    private readonly systemConfig: SystemConfigService,
    private readonly projectConfiguration: ProjectConfigurationService,
    @Optional() private readonly fieldConfiguration?: FieldConfigurationService,
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
      scope: requestedScope = 'mine',
      sort,
    } = query;
    const pageSize = requestedPageSize ?? (await this.systemConfig.getDefaultProjectPageSize());

    const allowedScope: Prisma.ProjectWhereInput = userId
      ? await this.projectAccess.buildProjectWhere(userId)
      : { deletedAt: null };
    const scope = this.buildRequestedScope(allowedScope, requestedScope, userId);
    const filters = this.buildProjectFilters(query);
    const archiveFilter: Prisma.ProjectWhereInput =
      requestedScope === 'archived' ? { archivedAt: { not: null } } : { archivedAt: null };

    const where: Prisma.ProjectWhereInput = {
      AND: [scope, archiveFilter, ...filters],
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
          customerType: true,
          projectType: true,
          contractType: true,
          product: true,
          keywords: true,
          contractCurrency: true,
          baseCurrency: true,
          contractAmount: true,
          exchangeRate: true,
          convertedAmount: true,
          acceptedConvertedAmount: true,
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
          currentStages: true,
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
        keyword: query.keyword ?? null,
        scope: requestedScope,
        lifecycleStatus: query.lifecycleStatus ?? null,
        countryCode: query.countryCode ?? null,
        customerType: query.customerType ?? null,
        projectType: query.projectType ?? null,
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
    query: QueryProjectDto = {},
  ): Promise<{
    total: number;
    active: number;
    acceptedThisYear: number;
    totalConvertedAmount: number | null;
    acceptedConvertedAmount: number | null;
  }> {
    const userId = this.getUserId(actor);
    if (!userId) {
      throw new ForbiddenException('缺少用户上下文');
    }
    const allowedScope = await this.projectAccess.buildProjectWhere(userId);
    const requestedScope = query.scope ?? 'mine';
    const scope = this.buildRequestedScope(allowedScope, requestedScope, userId);
    const archiveFilter: Prisma.ProjectWhereInput =
      requestedScope === 'archived' ? { archivedAt: { not: null } } : { archivedAt: null };
    const filteredScope: Prisma.ProjectWhereInput = {
      AND: [scope, archiveFilter, ...this.buildProjectFilters(query)],
    };
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const acceptedThisYearWhere: Prisma.ProjectWhereInput = {
      actualAcceptanceAt: {
        gte: new Date(Date.UTC(currentYear, 0, 1)),
        lte: now,
      },
    };
    const [total, active, acceptedThisYear, totalAmount, acceptedAmount] =
      await Promise.all([
        this.prisma.project.count({ where: filteredScope }),
        this.prisma.project.count({
          where: {
            AND: [filteredScope, { status: 'ACTIVE', archivedAt: null }],
          },
        }),
        this.prisma.project.count({ where: { AND: [filteredScope, acceptedThisYearWhere] } }),
        this.prisma.project.aggregate({
          where: filteredScope,
          _sum: { convertedAmount: true },
        }),
        this.prisma.project.aggregate({
          where: { AND: [filteredScope, acceptedThisYearWhere] },
          _sum: { acceptedConvertedAmount: true },
        }),
      ]);
    const canViewFinancial = this.canViewFinancial(actor);
    return {
      total,
      active,
      acceptedThisYear,
      totalConvertedAmount: canViewFinancial
        ? (totalAmount._sum.convertedAmount?.toNumber() ?? 0)
        : null,
      acceptedConvertedAmount: canViewFinancial
        ? (acceptedAmount._sum.acceptedConvertedAmount?.toNumber() ?? 0)
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

  async generateProjectCode(countryCode: string, contractSignedAt?: string | null): Promise<string> {
    const normalizedCountryCode = countryCode.trim().toUpperCase().replace(/[^A-Z0-9]/gu, '');
    if (!normalizedCountryCode) {
      throw new BadRequestException('国家代码无法用于生成项目编号');
    }
    const signedAt = contractSignedAt ? new Date(contractSignedAt) : new Date();
    const year = signedAt.getUTCFullYear();
    const prefix = `${year}-${normalizedCountryCode}-`;

    const lastProject = await this.prisma.project.findFirst({
      where: {
        projectCode: { startsWith: prefix },
      },
      orderBy: { projectCode: 'desc' },
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

    return `${prefix}${String(seq).padStart(4, '0')}`;
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
    this.assertProjectDateOrder(dto.contractSignedAt, dto.startDate, dto.expectedAcceptanceAt);
    this.assertProjectDateOrder(dto.contractSignedAt, dto.startDate, dto.actualAcceptanceAt);
    if (dto.actualAcceptanceAt !== undefined) this.assertProgressPermission(actor);
    await this.projectConfiguration.validate(dto);
    const deliveryStages = await this.resolveDeliveryStages(dto.deliveryStages);
    const deliveryStage = await this.resolvePrimaryDeliveryStage(deliveryStages);
    await Promise.all([
      this.fieldConfiguration?.assertConfiguredValue('COUNTRY', dto.countryCode),
      this.fieldConfiguration?.assertConfiguredValue('CURRENCY', dto.contractCurrency),
      this.fieldConfiguration?.assertConfiguredValue('CURRENCY', dto.baseCurrency),
    ]);
    await this.validateLeadershipAssignments(dto);
    const projectCode = await this.generateProjectCode(dto.countryCode, dto.contractSignedAt);
    const contractAmount =
      dto.contractAmount === undefined
        ? undefined
        : new Prisma.Decimal(dto.contractAmount).toDecimalPlaces(2);
    const amountData = await this.resolveAmountData(
      contractAmount,
      dto.contractCurrency,
      dto.baseCurrency,
    );
    const acceptedConvertedAmount =
      dto.acceptedConvertedAmount === undefined
        ? amountData.convertedAmount
        : new Prisma.Decimal(dto.acceptedConvertedAmount).toDecimalPlaces(2);
    const preparedPayments = await this.preparePaymentPlans(
      dto.paymentPlans,
      contractAmount,
      dto.contractCurrency,
      dto.baseCurrency,
      actor,
    );
    const riskLevel = dto.riskLevel ?? (await this.systemConfig.getDefaultProjectRiskLevel());
    const projectId = uuidv4();
    const preparedReview = dto.saveAsDraft
      ? null
      : await this.prepareProjectCreateReview(projectId, dto, userId);
    const initialLifecycleStatus = dto.saveAsDraft || preparedReview
      ? 'DRAFT'
      : dto.actualAcceptanceAt
        ? 'COMPLETED'
        : 'ACTIVE';

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
            customerType: dto.customerType,
            projectType: dto.projectType,
            contractType: dto.contractType,
            product: dto.product,
            keywords: dto.keywords ?? Prisma.JsonNull,
            contractCurrency: dto.contractCurrency,
            baseCurrency: dto.baseCurrency,
            contractAmount,
            acceptedConvertedAmount,
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
            currentStages: deliveryStages,
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
            actualAcceptanceAt: dto.actualAcceptanceAt ? new Date(dto.actualAcceptanceAt) : null,
            createIdempotencyKey: idempotencyKey,
            createRequestHash: requestHash,
            revision: 1,
            createdBy: userId,
          },
        });
        await this.syncLeadershipMembers(tx, created.id, dto);
        await this.syncPaymentPlans(tx, created.id, preparedPayments, userId);
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
        await writeOperationLog(tx, {
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
              deliveryStages,
              archiveTemplateId: archiveSnapshot.templateId,
              archiveTemplateVersionId: archiveSnapshot.templateVersionId,
              archiveSnapshotSource: archiveSnapshot.source,
              archiveFolderCount: archiveSnapshot.folderCount,
              archiveItemCount: archiveSnapshot.itemCount,
              reviewTaskId,
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
    const effectiveContractSignedAt =
      dto.contractSignedAt === undefined ? project.contractSignedAt : dto.contractSignedAt;
    const effectiveStartDate = dto.startDate === undefined ? project.startDate : dto.startDate;
    const effectiveExpectedAcceptanceAt =
      dto.expectedAcceptanceAt === undefined
        ? project.expectedAcceptanceAt
        : dto.expectedAcceptanceAt;
    const effectiveActualAcceptanceAt =
      dto.actualAcceptanceAt === undefined ? project.actualAcceptanceAt : dto.actualAcceptanceAt;
    this.assertProjectDateOrder(
      effectiveContractSignedAt,
      effectiveStartDate,
      effectiveExpectedAcceptanceAt,
    );
    this.assertProjectDateOrder(
      effectiveContractSignedAt,
      effectiveStartDate,
      effectiveActualAcceptanceAt,
    );
    if (
      dto.deliveryStages !== undefined ||
      dto.progressPercent !== undefined ||
      dto.expectedAcceptanceAt !== undefined ||
      dto.actualAcceptanceAt !== undefined
    ) {
      this.assertProgressPermission(actor);
    }
    await this.projectConfiguration.validateUpdate(dto, {
      customerType: project.customerType ?? undefined,
      projectType: project.projectType ?? undefined,
      contractType: project.contractType ?? undefined,
      product: project.product ?? undefined,
      keywords: Array.isArray(project.keywords)
        ? project.keywords.filter((keyword): keyword is string => typeof keyword === 'string')
        : [],
    });
    await Promise.all([
      this.fieldConfiguration?.assertConfiguredValue(
        'COUNTRY',
        dto.countryCode,
        project.countryCode,
      ),
      this.fieldConfiguration?.assertConfiguredValue(
        'CURRENCY',
        dto.contractCurrency,
        project.contractCurrency,
      ),
      this.fieldConfiguration?.assertConfiguredValue(
        'CURRENCY',
        dto.baseCurrency,
        project.baseCurrency,
      ),
    ]);
    const deliveryStages =
      dto.deliveryStages === undefined
        ? undefined
        : await this.resolveDeliveryStages(
            dto.deliveryStages,
            this.normalizeDeliveryStages(project.currentStages, project.currentStage),
          );
    const deliveryStage = deliveryStages
      ? await this.resolvePrimaryDeliveryStage(deliveryStages)
      : undefined;
    await this.validateLeadershipAssignments(dto);

    const updateData: Prisma.ProjectUncheckedUpdateInput = {};

    if (dto.projectName !== undefined) updateData.projectName = dto.projectName;
    if (dto.shortName !== undefined) updateData.shortName = dto.shortName;
    if (dto.countryCode !== undefined) updateData.countryCode = dto.countryCode;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.customerName !== undefined) updateData.customerName = dto.customerName;
    if (dto.customerType !== undefined) updateData.customerType = dto.customerType;
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
    if (dto.acceptedConvertedAmount !== undefined) {
      updateData.acceptedConvertedAmount = new Prisma.Decimal(
        dto.acceptedConvertedAmount,
      ).toDecimalPlaces(2);
    }
    const effectiveContractAmount = contractAmount ?? project.contractAmount ?? undefined;
    const effectiveContractCurrency = dto.contractCurrency ?? project.contractCurrency ?? undefined;
    const effectiveBaseCurrency = dto.baseCurrency ?? project.baseCurrency ?? undefined;
    const preparedPayments = await this.preparePaymentPlans(
      dto.paymentPlans,
      effectiveContractAmount,
      effectiveContractCurrency,
      effectiveBaseCurrency,
      actor,
    );
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
    if (deliveryStages !== undefined) {
      updateData.currentStages = deliveryStages;
      updateData.currentStage = deliveryStage;
    }
    if (dto.progressPercent !== undefined) {
      updateData.progressPercent = new Prisma.Decimal(dto.progressPercent).toDecimalPlaces(2);
    }
    if (dto.expectedAcceptanceAt !== undefined) {
      updateData.expectedAcceptanceAt = dto.expectedAcceptanceAt
        ? new Date(dto.expectedAcceptanceAt)
        : null;
    }
    const actualAcceptanceAt =
      dto.actualAcceptanceAt === undefined
        ? undefined
        : dto.actualAcceptanceAt
          ? new Date(dto.actualAcceptanceAt)
          : null;
    const becameAccepted = Boolean(actualAcceptanceAt && !project.actualAcceptanceAt);
    if (actualAcceptanceAt !== undefined) {
      updateData.actualAcceptanceAt = actualAcceptanceAt;
      if (actualAcceptanceAt) updateData.status = 'COMPLETED';
      else if (project.status === 'COMPLETED') updateData.status = 'ACTIVE';
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
      await this.syncPaymentPlans(tx, id, preparedPayments, userId);
      if (
        dto.deliveryStages !== undefined ||
        dto.progressPercent !== undefined ||
        dto.expectedAcceptanceAt !== undefined ||
        dto.actualAcceptanceAt !== undefined
      ) {
        await tx.projectProcessRecord.create({
          data: {
            projectId: id,
            title: '项目进度更新',
            recordType: 'Progress',
            stageCode: deliveryStage ?? project.currentStage,
            recordDate: new Date(),
            description: `进度更新为 ${dto.progressPercent ?? project.progressPercent?.toNumber() ?? 0}%`,
            createdBy: userId,
          },
        });
      }
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
      const updated = await tx.project.findUniqueOrThrow({ where: { id } });
      await writeOperationLog(tx, {
          userId,
          module: 'project',
          action: 'update',
          targetType: 'project',
          targetId: id,
          result: 'success',
          beforeData: this.projectUpdateAuditSnapshot(project),
          afterData: this.projectUpdateAuditSnapshot(updated),
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
    await this.fieldConfiguration?.assertConfiguredValue(
      'PROJECT_STAGE',
      dto.targetStage,
      project.currentStage,
    );

    const configuredStages = (await this.getProjectStageConfiguration()).values;
    const currentStage = this.requireDeliveryStage(project.currentStage, project.id);
    const currentIndex = configuredStages.findIndex((stage) => stage.value === currentStage);
    const targetIndex = configuredStages.findIndex((stage) => stage.value === dto.targetStage);
    if (currentIndex < 0) {
      throw new BadRequestException(`项目 ${project.id} 当前阶段未完成字段配置迁移`);
    }
    if (targetIndex < 0 || !configuredStages[targetIndex].enabled) {
      throw new BadRequestException('目标阶段不是当前启用的字段配置项');
    }
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
          currentStages: [dto.targetStage],
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
      await writeOperationLog(tx, {
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
      if (!this.hasPermission(actor, 'project:archive')) {
        throw new ForbiddenException('无权归档项目');
      }
      if (!['COMPLETED', 'CANCELLED'].includes(currentStatus)) {
        throw new BadRequestException('仅已完成或已取消的项目可以归档');
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
      await writeOperationLog(tx, {
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
      customerType: project.customerType,
      projectType: project.projectType,
      contractType: project.contractType,
      product: project.product,
      keywords: Array.isArray(project.keywords)
        ? project.keywords.filter((keyword): keyword is string => typeof keyword === 'string')
        : [],
      contractCurrency: project.contractCurrency,
      baseCurrency: project.baseCurrency,
      contractAmount: project.contractAmount?.toString() ?? null,
      acceptedConvertedAmount: project.acceptedConvertedAmount?.toString() ?? null,
      contractNo: project.contractNo,
      contractSignedAt: project.contractSignedAt?.toISOString() ?? null,
      projectLanguage: project.projectLanguage,
      salesOwnerId: project.salesOwnerId,
      projectManagerId: project.projectManagerId,
      electricalOwnerId: project.electricalOwnerId,
      softwareOwnerId: project.softwareOwnerId,
      currentStages: this.normalizeDeliveryStages(project.currentStages, project.currentStage),
      progressPercent: project.progressPercent?.toString() ?? null,
      riskLevel: project.riskLevel,
      riskDescription: project.riskDescription,
      startDate: project.startDate?.toISOString() ?? null,
      plannedEndDate: project.plannedEndDate?.toISOString() ?? null,
      expectedAcceptanceAt: project.expectedAcceptanceAt?.toISOString() ?? null,
      actualAcceptanceAt: project.actualAcceptanceAt?.toISOString() ?? null,
    };
  }

  private async resolveAmountData(
    amount?: string | number | Prisma.Decimal,
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

  private async preparePaymentPlans(
    plans: ProjectPaymentPlanWriteDto[] | undefined,
    contractAmount: Prisma.Decimal | undefined,
    contractCurrency: string | undefined,
    convertedCurrency: string | undefined,
    actor: ProjectActor,
  ): Promise<PreparedProjectPaymentPlan[] | undefined> {
    if (plans === undefined) return undefined;
    if (!this.hasPermission(actor, 'payment:operate')) {
      throw new ForbiddenException('无权修改项目款项计划');
    }
    if (plans.length === 0) return [];
    if (!contractAmount || !contractCurrency || !convertedCurrency) {
      throw new BadRequestException('维护款项计划前必须填写合同金额、合同币种和折算币种');
    }
    const expectedTotal = contractAmount.toDecimalPlaces(2);
    const actualTotal = plans.reduce(
      (total, plan) => total.add(new Prisma.Decimal(plan.originalAmount)),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    if (!actualTotal.equals(expectedTotal)) {
      throw new BadRequestException(
        `款项计划金额合计必须等于合同金额（当前 ${actualTotal.toFixed(2)}，合同 ${expectedTotal.toFixed(2)}）`,
      );
    }

    return Promise.all(
      plans.map(async (plan) => {
        if (plan.originalCurrency !== contractCurrency) {
          throw new BadRequestException('款项计划原币必须与合同币种一致');
        }
        if (plan.convertedCurrency !== convertedCurrency) {
          throw new BadRequestException('款项计划折算币种必须与合同折算币种一致');
        }
        const originalAmount = new Prisma.Decimal(plan.originalAmount).toDecimalPlaces(2);
        if (originalAmount.lte(0)) {
          throw new BadRequestException('款项计划付款金额必须大于0');
        }
        const receivedOriginalAmount = new Prisma.Decimal(
          plan.receivedOriginalAmount ?? 0,
        ).toDecimalPlaces(2);
        if (receivedOriginalAmount.gt(originalAmount)) {
          throw new BadRequestException('已回款金额不能大于应回款金额');
        }
        const amountData = await this.resolveAmountData(
          originalAmount,
          contractCurrency,
          convertedCurrency,
        );
        const exchangeRate = amountData.exchangeRate ?? new Prisma.Decimal(1);
        const dueDate = plan.dueDate ? new Date(plan.dueDate) : null;
        const receivedDate = plan.receivedDate ? new Date(plan.receivedDate) : null;
        const status = receivedOriginalAmount.gte(originalAmount) && originalAmount.gt(0)
          ? 'Received'
          : receivedOriginalAmount.gt(0)
            ? 'PartiallyReceived'
            : dueDate && dueDate.getTime() < Date.now()
              ? 'Overdue'
              : 'Planned';
        return {
          id: plan.id,
          paymentName: plan.paymentName,
          paymentType: plan.paymentType ?? 'Milestone',
          dueDate,
          receivedDate,
          status,
          originalAmount,
          originalCurrency: contractCurrency,
          exchangeRate,
          convertedCurrency,
          convertedAmount: amountData.convertedAmount ?? originalAmount,
          receivedOriginalAmount,
          receivedConvertedAmount: receivedOriginalAmount
            .mul(exchangeRate)
            .toDecimalPlaces(2),
          rateDate: amountData.exchangeRateDate ?? new Date(),
          rateSource: amountData.exchangeRateSource ?? 'identity',
          remark: plan.remark,
        };
      }),
    );
  }

  private async syncPaymentPlans(
    tx: Prisma.TransactionClient,
    projectId: string,
    plans: PreparedProjectPaymentPlan[] | undefined,
    userId: string,
  ): Promise<void> {
    if (plans === undefined) return;
    const existing = await tx.projectPayment.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((item) => item.id));
    const requestedIds = new Set(plans.flatMap((item) => (item.id ? [item.id] : [])));
    for (const id of requestedIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException('款项计划不存在或不属于当前项目');
      }
    }
    const removedIds = existing
      .map((item) => item.id)
      .filter((id) => !requestedIds.has(id));
    if (removedIds.length > 0) {
      await tx.projectPayment.updateMany({
        where: { projectId, id: { in: removedIds }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    }
    for (const plan of plans) {
      const { id, ...data } = plan;
      if (id) {
        await tx.projectPayment.update({
          where: { id },
          data: { ...data, deletedAt: null },
        });
      } else {
        await tx.projectPayment.create({
          data: { ...data, projectId, createdBy: userId },
        });
      }
    }
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
        await writeOperationLog(transaction, {
            userId: actor.sub,
            module: 'project',
            action: 'purge',
            targetType: 'project',
            targetId: id,
            beforeData: project,
            result: 'success',
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
      await writeOperationLog(this.prisma, {
          userId: actor.sub,
          module: 'project',
          action: 'purge',
          targetType: 'project',
          targetId: id,
          beforeData: result.project,
          afterData: result.blockers,
          result: 'failure',
          errorReason: `物理删除被依赖记录阻止：${reason}`,
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
      if (assignedUserId === undefined) continue;
      await client.projectMember.updateMany({
        where: {
          projectId,
          projectRole,
          deletedAt: null,
          ...(assignedUserId ? { userId: { not: assignedUserId } } : {}),
        },
        data: { deletedAt: new Date() },
      });
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

  private async validateLeadershipAssignments(
    dto: Partial<CreateProjectDto & UpdateProjectDto>,
  ): Promise<void> {
    const assignments = [
      [dto.salesOwnerId, '销售负责人'],
      [dto.projectManagerId, '项目经理'],
      [dto.electricalOwnerId, '电气工程师'],
      [dto.softwareOwnerId, '软件工程师'],
    ] as const;
    for (const [userId, fieldName] of assignments) {
      if (!userId) continue;
      const user = await this.prisma.user.findFirst({
        where: {
          id: userId,
          deletedAt: null,
          status: 'Active',
        },
        select: { id: true },
      });
      if (!user) {
        throw new BadRequestException(`${fieldName}必须选择有效的在职用户`);
      }
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
    if (requestedScope === 'all' || requestedScope === 'archived') return allowedScope;
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
    project: { status: string | null },
    actor?: ProjectActor,
  ): boolean {
    return Boolean(
      this.hasPermission(actor, 'project:archive') &&
        ['COMPLETED', 'CANCELLED'].includes(project.status ?? ''),
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

  private assertProjectDateOrder(
    contractSignedAt?: string | Date | null,
    startDate?: string | Date | null,
    expectedAcceptanceAt?: string | Date | null,
  ): void {
    const signed = contractSignedAt ? new Date(contractSignedAt).getTime() : undefined;
    const start = startDate ? new Date(startDate).getTime() : undefined;
    const acceptance = expectedAcceptanceAt
      ? new Date(expectedAcceptanceAt).getTime()
      : undefined;
    if (signed !== undefined && start !== undefined && start < signed) {
      throw new BadRequestException('开始时间不能早于签约时间');
    }
    if (start !== undefined && acceptance !== undefined && acceptance < start) {
      throw new BadRequestException('验收时间不能早于开始时间');
    }
  }

  private requireUserId(actor: ProjectActor): string {
    const userId = this.getUserId(actor);
    if (!userId) throw new ForbiddenException('缺少用户上下文');
    return userId;
  }

  private buildProjectFilters(query: QueryProjectDto): Prisma.ProjectWhereInput[] {
    const filters: Prisma.ProjectWhereInput[] = [];
    if (query.keyword) {
      filters.push({
        OR: [
          { projectName: { contains: query.keyword } },
          { shortName: { contains: query.keyword } },
          { projectCode: { contains: query.keyword } },
          { customerName: { contains: query.keyword } },
        ],
      });
    }
    if (query.lifecycleStatus) filters.push({ status: query.lifecycleStatus });
    if (query.countryCode) filters.push({ countryCode: query.countryCode });
    if (query.projectType) filters.push({ projectType: query.projectType });
    if (query.customerType) filters.push({ customerType: query.customerType });
    return filters;
  }

  private resolveProjectOrderBy(sort?: string): Prisma.ProjectOrderByWithRelationInput {
    switch (sort) {
      case 'updatedAt:asc':
        return { updatedAt: 'asc' };
      case 'projectName:asc':
        return { projectName: 'asc' };
      case 'projectName:desc':
        return { projectName: 'desc' };
      case 'projectManager:asc':
        return { projectManager: { realName: 'asc' } };
      case 'projectManager:desc':
        return { projectManager: { realName: 'desc' } };
      default:
        return { updatedAt: 'desc' };
    }
  }

  private async getCountryNames(countryCodes: string[]): Promise<Map<string, string>> {
    const uniqueCodes = [...new Set(countryCodes.filter(Boolean))];
    if (uniqueCodes.length === 0) return new Map();
    const countryField = await this.prisma.dictionaryCategory.findUnique({
      where: { categoryCode: 'COUNTRY' },
      select: {
        items: {
          where: { itemValue: { in: uniqueCodes }, deletedAt: null },
          select: { itemValue: true, itemLabel: true },
        },
      },
    });
    return new Map(
      (countryField?.items ?? []).map((country) => [country.itemValue, country.itemLabel]),
    );
  }

  private requireDeliveryStage(value: string | null, projectId: string): ProjectDeliveryStage {
    if (value?.trim()) return value;
    throw new BadRequestException(`项目 ${projectId} 尚未完成目标阶段迁移`);
  }

  private async getProjectStageConfiguration() {
    if (!this.fieldConfiguration) {
      throw new BadRequestException('项目阶段字段配置服务不可用');
    }
    const configuration = await this.fieldConfiguration.findEnabled('PROJECT_STAGE');
    if (!configuration.enabled) {
      throw new BadRequestException('项目阶段字段配置已停用');
    }
    return configuration;
  }

  private async resolveDeliveryStages(
    values?: string[],
    existingValues: string[] = [],
  ): Promise<ProjectDeliveryStage[]> {
    const configuration = await this.getProjectStageConfiguration();
    if (values !== undefined) {
      const uniqueValues = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
      if (uniqueValues.length === 0) {
        throw new BadRequestException('当前阶段至少选择一项');
      }
      const existing = new Set(existingValues);
      for (const value of uniqueValues) {
        const option = configuration.values.find((item) => item.value === value);
        if (!option || (!option.enabled && !existing.has(value))) {
          throw new BadRequestException(`项目阶段 ${value} 不是当前启用的字段配置项`);
        }
      }
      const order = new Map(configuration.values.map((option, index) => [option.value, index]));
      return uniqueValues.sort(
        (left, right) =>
          (order.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right) ?? Number.MAX_SAFE_INTEGER),
      );
    }
    const defaultValue =
      typeof configuration.defaultValue === 'string' ? configuration.defaultValue : '';
    if (
      defaultValue &&
      configuration.values.some((option) => option.value === defaultValue && option.enabled)
    ) {
      return [defaultValue];
    }
    throw new BadRequestException('项目阶段字段配置缺少有效默认值');
  }

  private async resolvePrimaryDeliveryStage(
    values: ProjectDeliveryStage[],
  ): Promise<ProjectDeliveryStage> {
    const configuration = await this.getProjectStageConfiguration();
    const selected = new Set(values);
    const primary = [...configuration.values]
      .reverse()
      .find((option) => selected.has(option.value))?.value;
    if (primary) return primary;
    throw new BadRequestException('当前阶段未匹配项目阶段字段配置');
  }

  private normalizeDeliveryStages(
    value: Prisma.JsonValue | null | undefined,
    fallback: string | null,
  ): ProjectDeliveryStage[] {
    const stages = Array.isArray(value)
      ? value.filter(
          (stage): stage is string => typeof stage === 'string' && Boolean(stage.trim()),
        )
      : [];
    if (stages.length > 0) return [...new Set(stages)];
    return fallback?.trim() ? [fallback] : [];
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
      | 'acceptedConvertedAmount'
      | 'contractNo'
      | 'contractSignedAt'
      | 'expectedAcceptanceAt'
      | 'actualAcceptanceAt'
    >,
    actor?: ProjectActor,
  ): void {
    const includesFinancialData =
      dto.contractCurrency !== undefined ||
      dto.baseCurrency !== undefined ||
      dto.contractAmount !== undefined ||
      dto.acceptedConvertedAmount !== undefined;
    if (includesFinancialData && actor && !this.canViewFinancial(actor)) {
      throw new ForbiddenException('无权设置项目财务信息');
    }
    const includesContractData = dto.contractNo !== undefined || dto.contractSignedAt !== undefined;
    if (includesContractData && actor && !this.canViewContract(actor)) {
      throw new ForbiddenException('无权设置项目合同信息');
    }
    if (
      (dto.expectedAcceptanceAt !== undefined || dto.actualAcceptanceAt !== undefined) &&
      actor &&
      !this.canViewAcceptance(actor)
    ) {
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
    await writeOperationLog(this.prisma, {
        userId: actor.sub,
        module: 'project',
        action,
        targetType: 'project',
        targetId,
        ipAddress: context.ipAddress?.slice(0, 50),
        userAgent: context.userAgent?.slice(0, 500),
        result: 'success',
        afterData,
    });
  }

  private toProjectResponse<
    T extends {
      id: string;
      status: string | null;
      currentStage: string | null;
      currentStages?: Prisma.JsonValue | null;
      contractCurrency: string | null;
      baseCurrency: string | null;
      contractAmount: Prisma.Decimal | null;
      exchangeRate: Prisma.Decimal | null;
      convertedAmount: Prisma.Decimal | null;
      acceptedConvertedAmount: Prisma.Decimal | null;
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
      acceptedConvertedAmount,
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
      currentStages,
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
      currentStages: this.normalizeDeliveryStages(currentStages, currentStage),
      progressPercent: progressPercent?.toNumber() ?? null,
      contractCurrency: canViewFinancial ? contractCurrency : null,
      baseCurrency: canViewFinancial ? baseCurrency : null,
      contractAmount: canViewFinancial ? (contractAmount?.toFixed(2) ?? null) : null,
      exchangeRate: canViewFinancial ? (exchangeRate?.toFixed(8) ?? null) : null,
      convertedAmount: canViewFinancial ? (convertedAmount?.toFixed(2) ?? null) : null,
      acceptedConvertedAmount: canViewFinancial
        ? (acceptedConvertedAmount?.toFixed(2) ?? null)
        : null,
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
      convertedCnyAmount: canViewFinancial ? (convertedAmount?.toFixed(2) ?? null) : null,
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
