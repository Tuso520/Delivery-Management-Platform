import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ChecklistItemStatus, Prisma } from '@prisma/client';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { ApprovalService } from '../platform/approval.service';
import { ProjectAccessService } from '../project/project-access.service';

import {
  CreateChecklistTemplateDto,
  UpdateChecklistTemplateDto,
  CreateChecklistTemplateItemDto,
  UpdateChecklistTemplateItemDto,
  ReorderItemsDto,
  UpdateProjectChecklistItemDto,
  ReviewChecklistItemDto,
  QueryChecklistTemplateDto,
} from './dto/checklist.dto';

@Injectable()
export class ChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: ApprovalService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async findAllTemplates(query: QueryChecklistTemplateDto): Promise<PaginatedResult<unknown>> {
    const { page = 1, pageSize = 20, keyword, countryCode, projectType, status } = query;

    const where: Record<string, unknown> = {};

    if (keyword) {
      where.OR = [
        { templateCode: { contains: keyword } },
        { templateName: { contains: keyword } },
      ];
    }
    if (countryCode) {
      where.countryCode = countryCode;
    }
    if (projectType) {
      where.projectType = projectType;
    }
    if (status) {
      where.status = status;
    }

    const [total, list] = await Promise.all([
      this.prisma.checklistTemplate.count({ where }),
      this.prisma.checklistTemplate.findMany({
        where,
        select: {
          id: true,
          templateCode: true,
          templateName: true,
          countryCode: true,
          projectType: true,
          stageCode: true,
          version: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { items: true },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      list: list.map((t) => ({
        id: t.id,
        templateCode: t.templateCode,
        templateName: t.templateName,
        countryCode: t.countryCode,
        projectType: t.projectType,
        stageCode: t.stageCode,
        version: t.version,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        itemCount: t._count.items,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findTemplateById(id: string) {
    const template = await this.prisma.checklistTemplate.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: [{ sortOrder: 'asc' }, { itemName: 'asc' }],
        },
      },
    });

    if (!template) {
      throw new NotFoundException('检查清单模板不存在');
    }

    return template;
  }

  async createTemplate(dto: CreateChecklistTemplateDto) {
    const existing = await this.prisma.checklistTemplate.findUnique({
      where: { templateCode: dto.templateCode },
    });

    if (existing) {
      throw new ConflictException('检查清单模板编码已存在');
    }

    return this.prisma.checklistTemplate.create({
      data: {
        templateCode: dto.templateCode,
        templateName: dto.templateName,
        countryCode: dto.countryCode,
        projectType: dto.projectType,
        stageCode: dto.stageCode,
        version: dto.version || 'V1.0',
      },
      select: {
        id: true,
        templateCode: true,
        templateName: true,
        countryCode: true,
        projectType: true,
        stageCode: true,
        version: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async updateTemplate(id: string, dto: UpdateChecklistTemplateDto) {
    const template = await this.prisma.checklistTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException('检查清单模板不存在');
    }

    const data: Record<string, unknown> = {};
    if (dto.templateName !== undefined) data.templateName = dto.templateName;
    if (dto.countryCode !== undefined) data.countryCode = dto.countryCode;
    if (dto.projectType !== undefined) data.projectType = dto.projectType;
    if (dto.stageCode !== undefined) data.stageCode = dto.stageCode;
    if (dto.version !== undefined) data.version = dto.version;
    if (dto.status !== undefined) data.status = dto.status;

    return this.prisma.checklistTemplate.update({
      where: { id },
      data,
      select: {
        id: true,
        templateCode: true,
        templateName: true,
        countryCode: true,
        projectType: true,
        stageCode: true,
        version: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  async deleteTemplate(id: string): Promise<void> {
    const template = await this.prisma.checklistTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException('检查清单模板不存在');
    }

    const usageCount = await this.prisma.projectChecklistItem.count({
      where: { templateItem: { templateId: id } },
    });

    if (usageCount > 0) {
      throw new BadRequestException('该模板已被项目使用，无法删除');
    }

    await this.prisma.checklistTemplate.delete({ where: { id } });
  }

  async addItem(templateId: string, dto: CreateChecklistTemplateItemDto) {
    const template = await this.prisma.checklistTemplate.findUnique({ where: { id: templateId } });
    if (!template) {
      throw new NotFoundException('检查清单模板不存在');
    }

    return this.prisma.checklistTemplateItem.create({
      data: {
        templateId,
        itemName: dto.itemName,
        itemDescription: dto.itemDescription,
        checkStandard: dto.checkStandard,
        evidenceRequired: dto.evidenceRequired,
        evidenceTypes: dto.evidenceTypes?.join(',') ?? 'photo,file',
        minEvidenceCount: dto.minEvidenceCount ?? 0,
        allowAlbum: dto.allowAlbum ?? true,
        requireLocation: dto.requireLocation ?? false,
        relatedArchiveTemplateItemId: dto.relatedArchiveTemplateItemId,
        isRequired: dto.isRequired ?? true,
        riskLevel: dto.riskLevel || 'Low',
        responsibleRole: dto.responsibleRole,
        reviewRole: dto.reviewRole,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateItem(templateItemId: string, dto: UpdateChecklistTemplateItemDto) {
    const item = await this.prisma.checklistTemplateItem.findUnique({
      where: { id: templateItemId },
    });
    if (!item) {
      throw new NotFoundException('检查清单模板项不存在');
    }

    const data: Record<string, unknown> = {};
    if (dto.itemName !== undefined) data.itemName = dto.itemName;
    if (dto.itemDescription !== undefined) data.itemDescription = dto.itemDescription;
    if (dto.checkStandard !== undefined) data.checkStandard = dto.checkStandard;
    if (dto.evidenceRequired !== undefined) data.evidenceRequired = dto.evidenceRequired;
    if (dto.evidenceTypes !== undefined) data.evidenceTypes = dto.evidenceTypes.join(',');
    if (dto.minEvidenceCount !== undefined) data.minEvidenceCount = dto.minEvidenceCount;
    if (dto.allowAlbum !== undefined) data.allowAlbum = dto.allowAlbum;
    if (dto.requireLocation !== undefined) data.requireLocation = dto.requireLocation;
    if (dto.relatedArchiveTemplateItemId !== undefined) data.relatedArchiveTemplateItemId = dto.relatedArchiveTemplateItemId;
    if (dto.isRequired !== undefined) data.isRequired = dto.isRequired;
    if (dto.riskLevel !== undefined) data.riskLevel = dto.riskLevel;
    if (dto.responsibleRole !== undefined) data.responsibleRole = dto.responsibleRole;
    if (dto.reviewRole !== undefined) data.reviewRole = dto.reviewRole;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    return this.prisma.checklistTemplateItem.update({
      where: { id: templateItemId },
      data,
    });
  }

  async deleteTemplateItem(itemId: string): Promise<void> {
    const item = await this.prisma.checklistTemplateItem.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException('检查清单模板项不存在');
    }

    await this.prisma.checklistTemplateItem.delete({ where: { id: itemId } });
  }

  async reorderItems(templateId: string, dto: ReorderItemsDto) {
    const template = await this.prisma.checklistTemplate.findUnique({ where: { id: templateId } });
    if (!template) {
      throw new NotFoundException('检查清单模板不存在');
    }

    const updates = dto.itemIds.map((id, index) =>
      this.prisma.checklistTemplateItem.update({
        where: { id },
        data: { sortOrder: index },
      }),
    );

    await this.prisma.$transaction(updates);
    return this.findTemplateById(templateId);
  }

  async findByProject(projectId: string, userId: string) {
    await this.projectAccess.assertProjectAccess(projectId, userId);

    const items = await this.prisma.projectChecklistItem.findMany({
      where: { projectId },
      include: {
        templateItem: true,
        responsibleUser: {
          select: { id: true, realName: true, username: true },
        },
        reviewUser: {
          select: { id: true, realName: true, username: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return Promise.all(
      items.map(async (item) => ({
        ...item,
        evidenceCount: await this.prisma.attachment.count({
          where: {
            ownerType: 'ChecklistItem',
            ownerId: item.id,
            deletedAt: null,
          },
        }),
      })),
    );
  }

  async generate(projectId: string, templateId: string, userId: string) {
    await this.projectAccess.assertProjectAccess(projectId, userId);

    const template = await this.prisma.checklistTemplate.findUnique({
      where: { id: templateId },
      include: { items: true },
    });
    if (!template) {
      throw new NotFoundException('检查清单模板不存在');
    }

    const existingCount = await this.prisma.projectChecklistItem.count({
      where: { projectId, templateItem: { templateId } },
    });
    if (existingCount > 0) {
      throw new ConflictException('该项目已从此模板生成过检查清单');
    }

    const items = template.items.map((item) => ({
      projectId,
      templateItemId: item.id,
      itemName: item.itemName,
      checkStandard: item.checkStandard,
      evidenceRequired: item.evidenceRequired,
      responsibleUserId: null as string | null,
      reviewUserId: null as string | null,
      status: ChecklistItemStatus.Pending,
    }));

    await this.prisma.projectChecklistItem.createMany({ data: items });

    return this.findByProject(projectId, userId);
  }

  async updateProjectItem(
    itemId: string,
    dto: UpdateProjectChecklistItemDto,
    userId: string,
  ) {
    const item = await this.prisma.projectChecklistItem.findUnique({
      where: { id: itemId },
      select: { id: true, projectId: true },
    });
    if (!item) {
      throw new NotFoundException('项目检查项不存在');
    }
    await this.projectAccess.assertProjectAccess(item.projectId, userId);

    const data: Record<string, unknown> = {};
    if (dto.itemName !== undefined) data.itemName = dto.itemName;
    if (dto.checkStandard !== undefined) data.checkStandard = dto.checkStandard;
    if (dto.evidenceRequired !== undefined) data.evidenceRequired = dto.evidenceRequired;
    if (dto.responsibleUserId !== undefined) data.responsibleUserId = dto.responsibleUserId;
    if (dto.reviewUserId !== undefined) data.reviewUserId = dto.reviewUserId;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate;
    if (dto.result !== undefined) data.result = dto.result;
    if (dto.resultNote !== undefined) data.resultNote = dto.resultNote;

    return this.prisma.projectChecklistItem.update({
      where: { id: itemId },
      data,
      include: {
        responsibleUser: { select: { id: true, realName: true, username: true } },
        reviewUser: { select: { id: true, realName: true, username: true } },
      },
    });
  }

  async submitItem(itemId: string, userId: string) {
    const item = await this.prisma.projectChecklistItem.findUnique({
      where: { id: itemId },
      include: {
        project: {
          select: { id: true, projectCode: true, countryCode: true },
        },
        templateItem: {
          select: {
            minEvidenceCount: true,
            evidenceTypes: true,
            requireLocation: true,
          },
        },
      },
    });
    if (!item) {
      throw new NotFoundException('项目检查项不存在');
    }
    await this.projectAccess.assertProjectAccess(item.project.id, userId);

    if (
      item.status !== ChecklistItemStatus.Processing &&
      item.status !== ChecklistItemStatus.Pending &&
      item.status !== ChecklistItemStatus.Rejected
    ) {
      throw new BadRequestException(`当前状态为 ${item.status}，不可提交审核`);
    }

    const allowedEvidenceTypes = new Set(
      item.templateItem.evidenceTypes
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
    const evidenceWhere: Prisma.AttachmentWhereInput = {
      ownerType: 'ChecklistItem',
      ownerId: itemId,
      deletedAt: null,
    };
    if (allowedEvidenceTypes.has('photo') && !allowedEvidenceTypes.has('file')) {
      evidenceWhere.mimeType = { startsWith: 'image/' };
    } else if (
      allowedEvidenceTypes.has('file') &&
      !allowedEvidenceTypes.has('photo')
    ) {
      evidenceWhere.NOT = { mimeType: { startsWith: 'image/' } };
    }
    const evidenceCount = await this.prisma.attachment.count({
      where: evidenceWhere,
    });
    if (evidenceCount < item.templateItem.minEvidenceCount) {
      throw new BadRequestException(
        `至少需要上传 ${item.templateItem.minEvidenceCount} 个检查证据，当前仅 ${evidenceCount} 个`,
      );
    }
    if (item.templateItem.requireLocation) {
      const locatedEvidenceCount = await this.prisma.attachment.count({
        where: {
          ...evidenceWhere,
          latitude: { not: null },
          longitude: { not: null },
        },
      });
      if (locatedEvidenceCount < item.templateItem.minEvidenceCount) {
        throw new BadRequestException('该检查项要求证据包含现场定位');
      }
    }

    return this.approvalService.startBusinessApproval({
      businessType: 'checklist',
      businessId: item.id,
      businessTitle: `${item.project.projectCode} ${item.itemName}`,
      applicantId: userId,
      countryCode: item.project.countryCode,
    });
  }

  async reviewItem(
    itemId: string,
    dto: ReviewChecklistItemDto,
    reviewerId: string,
  ) {
    const item = await this.prisma.projectChecklistItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        projectId: true,
        status: true,
      },
    });
    if (!item) {
      throw new NotFoundException('项目检查项不存在');
    }
    await this.projectAccess.assertProjectAccess(item.projectId, reviewerId);

    if (item.status !== ChecklistItemStatus.Submitted && item.status !== ChecklistItemStatus.Reviewing) {
      throw new BadRequestException('当前状态不可审核');
    }

    if (
      dto.status === ChecklistItemStatus.Approved ||
      dto.status === ChecklistItemStatus.Rejected
    ) {
      await this.approvalService.decideBusinessTask(
        'checklist',
        itemId,
        {
          decision:
            dto.status === ChecklistItemStatus.Approved
              ? 'Approved'
              : 'Rejected',
          comment: dto.comment,
        },
        reviewerId,
      );
    } else {
      const now = new Date();
      await this.prisma.projectChecklistItem.update({
        where: { id: itemId },
        data: {
          status: dto.status,
          reviewUserId: reviewerId,
          reviewComment: dto.comment,
          reviewedAt: now,
          completedAt:
            dto.status === ChecklistItemStatus.Closed ? now : undefined,
        },
      });
    }

    return this.prisma.projectChecklistItem.findUnique({
      where: { id: itemId },
      include: {
        responsibleUser: { select: { id: true, realName: true, username: true } },
        reviewUser: { select: { id: true, realName: true, username: true } },
      },
    });
  }

}
