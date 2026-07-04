import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectStatus, RiskLevel } from '@prisma/client';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../database/prisma.service';

import { CreateProjectDto } from './dto/create-project.dto';
import { QueryProjectDto } from './dto/query-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectAccessService } from './project-access.service';

interface ProjectListItem {
  id: string;
  projectCode: string;
  projectName: string;
  countryCode: string;
  city: string | null;
  customerName: string | null;
  projectType: string | null;
  contractCurrency: string | null;
  baseCurrency: string | null;
  contractAmount: number | null;
  exchangeRate: number | null;
  convertedAmount: number | null;
  exchangeRateDate: Date | null;
  exchangeRateSource: string | null;
  projectLanguage: string | null;
  currentStage: string | null;
  projectStatus: string;
  riskLevel: string;
  startDate: Date | null;
  plannedEndDate: Date | null;
  actualEndDate: Date | null;
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
  ) {}

  async findAll(
    query: QueryProjectDto,
    userId?: string,
  ): Promise<PaginatedResult<ProjectListItem>> {
    const { page = 1, pageSize = 20, keyword, projectStatus, countryCode, projectType } = query;

    const where: Prisma.ProjectWhereInput = userId
      ? await this.projectAccess.buildProjectWhere(userId)
      : { deletedAt: null };

    if (keyword) {
      where.OR = [
        { projectName: { contains: keyword } },
        { projectCode: { contains: keyword } },
      ];
    }

    if (projectStatus) {
      where.projectStatus = projectStatus;
    }

    if (countryCode) {
      where.countryCode = countryCode;
    }

    if (projectType) {
      where.projectType = projectType;
    }

    const [total, list] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        select: {
          id: true,
          projectCode: true,
          projectName: true,
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
          currentStage: true,
          projectStatus: true,
          riskLevel: true,
          startDate: true,
          plannedEndDate: true,
          actualEndDate: true,
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
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const projectList: ProjectListItem[] = list.map((project) => ({
      ...project,
      contractAmount: project.contractAmount ? project.contractAmount.toNumber() : null,
      exchangeRate: project.exchangeRate ? project.exchangeRate.toNumber() : null,
      convertedAmount: project.convertedAmount
        ? project.convertedAmount.toNumber()
        : null,
    }));

    return {
      list: projectList,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(id: string, userId?: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                realName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在');
    }

    // Data scope authorization: skip elevated roles, check membership for others
    if (userId) {
      await this.checkProjectAccess(id, userId);
    }

    return {
      ...project,
      contractAmount: project.contractAmount?.toNumber() ?? null,
      exchangeRate: project.exchangeRate?.toNumber() ?? null,
      convertedAmount: project.convertedAmount?.toNumber() ?? null,
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

  async create(dto: CreateProjectDto, userId?: string) {
    const customerCode = dto.customerName
      ? dto.customerName.substring(0, 2).toUpperCase()
      : 'XX';

    const projectCode = await this.generateProjectCode(dto.countryCode, customerCode);
    const amountData = await this.resolveAmountData(
      dto.contractAmount,
      dto.contractCurrency,
      dto.baseCurrency,
    );

    const project = await this.prisma.project.create({
      data: {
        projectCode,
        projectName: dto.projectName,
        countryCode: dto.countryCode,
        city: dto.city,
        customerName: dto.customerName,
        projectType: dto.projectType,
        contractCurrency: dto.contractCurrency,
        baseCurrency: dto.baseCurrency,
        contractAmount: dto.contractAmount ?? undefined,
        ...amountData,
        projectLanguage: dto.projectLanguage,
        projectManagerId: dto.projectManagerId,
        electricLeaderId: dto.electricLeaderId,
        softwareLeaderId: dto.softwareLeaderId,
        purchaseOwnerId: dto.purchaseOwnerId,
        financeOwnerId: dto.financeOwnerId,
        currentStage: dto.currentStage || 'Initiation',
        projectStatus: ProjectStatus.Draft,
        riskLevel: (dto.riskLevel as RiskLevel | undefined) || RiskLevel.Low,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null,
        createdBy: userId,
      },
    });

    await this.syncLeadershipMembers(project.id, dto, userId);
    return this.findById(project.id, userId);
  }

  async update(id: string, dto: UpdateProjectDto, userId?: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
    });

    if (!project) {
      throw new NotFoundException('项目不存在');
    }

    // Data scope authorization
    if (userId) {
      await this.checkProjectAccess(id, userId);
    }

    const updateData: Prisma.ProjectUpdateInput = {};

    if (dto.projectName !== undefined) updateData.projectName = dto.projectName;
    if (dto.countryCode !== undefined) updateData.countryCode = dto.countryCode;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.customerName !== undefined) updateData.customerName = dto.customerName;
    if (dto.projectType !== undefined) updateData.projectType = dto.projectType;
    if (dto.contractCurrency !== undefined) updateData.contractCurrency = dto.contractCurrency;
    if (dto.baseCurrency !== undefined) updateData.baseCurrency = dto.baseCurrency;
    if (dto.contractAmount !== undefined) updateData.contractAmount = dto.contractAmount;
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
    if (dto.projectManagerId !== undefined) updateData.projectManagerId = dto.projectManagerId;
    if (dto.electricLeaderId !== undefined) updateData.electricLeaderId = dto.electricLeaderId;
    if (dto.softwareLeaderId !== undefined) updateData.softwareLeaderId = dto.softwareLeaderId;
    if (dto.purchaseOwnerId !== undefined) updateData.purchaseOwnerId = dto.purchaseOwnerId;
    if (dto.financeOwnerId !== undefined) updateData.financeOwnerId = dto.financeOwnerId;
    if (dto.currentStage !== undefined) updateData.currentStage = dto.currentStage;
    if (dto.projectStatus !== undefined) updateData.projectStatus = dto.projectStatus as ProjectStatus;
    if (dto.riskLevel !== undefined) updateData.riskLevel = dto.riskLevel as RiskLevel;
    if (dto.startDate !== undefined) updateData.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.plannedEndDate !== undefined) updateData.plannedEndDate = dto.plannedEndDate ? new Date(dto.plannedEndDate) : null;
    if (dto.actualEndDate !== undefined) updateData.actualEndDate = dto.actualEndDate ? new Date(dto.actualEndDate) : null;

    const updated = await this.prisma.project.update({
      where: { id },
      data: updateData,
    });

    await this.syncLeadershipMembers(updated.id, dto);
    return {
      ...updated,
      contractAmount: updated.contractAmount?.toNumber() ?? null,
      exchangeRate: updated.exchangeRate?.toNumber() ?? null,
      convertedAmount: updated.convertedAmount?.toNumber() ?? null,
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
      throw new BadRequestException(
        `未配置 ${contractCurrency} 到 ${baseCurrency} 的有效汇率`,
      );
    }
    return {
      exchangeRate: rate.rate,
      convertedAmount: originalAmount.mul(rate.rate),
      exchangeRateDate: rate.rateDate,
      exchangeRateSource: rate.source,
    };
  }

  async softDelete(id: string, userId?: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
    });

    if (!project) {
      throw new NotFoundException('项目不存在');
    }

    // Data scope authorization
    if (userId) {
      await this.checkProjectAccess(id, userId);
    }

    await this.prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Check if a user has access to a project.
   * Elevated roles (SUPER_ADMIN, SYSTEM_ADMIN, DELIVERY_MANAGER) bypass the check.
   * Other users must be a member of the project.
   */
  private async checkProjectAccess(projectId: string, userId: string): Promise<void> {
    await this.projectAccess.assertProjectAccess(projectId, userId);
  }

  private async syncLeadershipMembers(
    projectId: string,
    dto: Partial<CreateProjectDto & UpdateProjectDto>,
    creatorId?: string,
  ): Promise<void> {
    const assignments = [
      [dto.projectManagerId, 'PROJECT_MANAGER'],
      [dto.electricLeaderId, 'ELEC_LEADER'],
      [dto.softwareLeaderId, 'SOFTWARE_LEADER'],
      [dto.purchaseOwnerId, 'PURCHASE'],
      [dto.financeOwnerId, 'FINANCE'],
      [creatorId, 'PROJECT_MANAGER'],
    ] as const;
    for (const [assignedUserId, projectRole] of assignments) {
      if (!assignedUserId) continue;
      await this.prisma.projectMember.upsert({
        where: {
          projectId_userId: { projectId, userId: assignedUserId },
        },
        create: {
          projectId,
          userId: assignedUserId,
          projectRole,
        },
        update: { projectRole },
      });
    }
  }
}
