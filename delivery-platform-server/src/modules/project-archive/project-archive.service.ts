import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { ProjectAccessService } from '../project/project-access.service';

import { GenerateArchiveDto, UpdateArchiveItemDto } from './dto/project-archive.dto';

interface StageStatistics {
  stageCode: string;
  stageName: string;
  totalItems: number;
  completedItems: number;
  completionRate: number;
}

interface ArchiveStatistics {
  totalItems: number;
  completedItems: number;
  requiredItems: number;
  starItems: number;
  completionRate: number;
  stages: StageStatistics[];
}

@Injectable()
export class ProjectArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async generateArchive(projectId: string, dto: GenerateArchiveDto, userId: string) {
    await this.projectAccess.assertProjectAccess(projectId, userId);

    const template = await this.prisma.archiveTemplate.findUnique({
      where: { id: dto.templateId },
      include: {
        items: {
          orderBy: [{ stageCode: 'asc' }, { sortOrder: 'asc' }, { itemNo: 'asc' }],
        },
      },
    });

    if (!template) {
      throw new NotFoundException('档案模板不存在');
    }

    if (template.items.length === 0) {
      throw new BadRequestException('模板中没有目录项');
    }

    // Check if archive items already exist for this project
    const existingCount = await this.prisma.projectArchiveItem.count({
      where: { projectId },
    });

    if (existingCount > 0) {
      throw new BadRequestException('该项目已有档案目录，如需重新生成请先清空现有档案');
    }

    // Get project members to match responsible/review roles
    const projectMembers = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            realName: true,
          },
        },
      },
    });

    // Build a role-to-user mapping from project members
    const roleUserMap = new Map<string, string>();
    for (const member of projectMembers) {
      if (!roleUserMap.has(member.projectRole)) {
        roleUserMap.set(member.projectRole, member.userId);
      }
    }

    // We need parentId mapping for hierarchical items
    // First pass: create all items without parentId
    // Second pass: update parentId using template item IDs
    const templateItemIdToArchiveItemId = new Map<string, string>();

    // Sort items so parents are created before children
    const sortedItems = [...template.items].sort((a, b) => a.level - b.level);

    // Use transaction to ensure all archive items are created atomically
    await this.prisma.$transaction(async (tx) => {
      for (const templateItem of sortedItems) {
        const responsibleUserId = templateItem.responsibleRole
          ? roleUserMap.get(templateItem.responsibleRole) || null
          : null;

        const reviewUserId = templateItem.reviewRole
          ? roleUserMap.get(templateItem.reviewRole) || null
          : null;

        const archiveItem = await tx.projectArchiveItem.create({
          data: {
            projectId,
            templateItemId: templateItem.id,
            parentId: templateItem.parentId
              ? templateItemIdToArchiveItemId.get(templateItem.parentId) || null
              : null,
            stageCode: templateItem.stageCode,
            itemNo: templateItem.itemNo,
            level: templateItem.level,
            name: templateItem.name,
            secondName: templateItem.secondName,
            usageDescription: templateItem.usageDescription,
            isRequired: templateItem.isRequired,
            isStar: templateItem.isStar,
            isSensitive: templateItem.isSensitive,
            needReview: templateItem.needReview,
            responsibleUserId,
            reviewUserId,
            sortOrder: templateItem.sortOrder,
            status: 'NotStarted',
          },
        });

        templateItemIdToArchiveItemId.set(templateItem.id, archiveItem.id);
      }
    });

    return {
      message: '档案目录生成成功',
      totalItems: template.items.length,
      templateName: template.templateName,
    };
  }

  async findByProject(projectId: string, userId: string) {
    await this.projectAccess.assertProjectAccess(projectId, userId);

    const items = await this.prisma.projectArchiveItem.findMany({
      where: { projectId },
      include: {
        responsibleUser: {
          select: { id: true, realName: true, username: true },
        },
        reviewUser: {
          select: { id: true, realName: true, username: true },
        },
        files: {
          where: { isCurrent: true },
          select: {
            id: true,
            fileName: true,
            originalName: true,
            fileExt: true,
            fileSize: true,
            mimeType: true,
            versionNo: true,
            fileStatus: true,
            uploadTime: true,
            remark: true,
            uploadUser: {
              select: { id: true, realName: true },
            },
          },
          orderBy: { versionNo: 'desc' },
        },
      },
      orderBy: [{ stageCode: 'asc' }, { sortOrder: 'asc' }, { itemNo: 'asc' }],
    });

    const nodeMap = new Map<
      string,
      Record<string, unknown> & { children: Record<string, unknown>[] }
    >();
    for (const item of items) {
      nodeMap.set(item.id, { ...item, children: [] });
    }

    const rootItems = items.filter((item) => {
      if (!item.parentId) return true;
      const parent = nodeMap.get(item.parentId);
      const child = nodeMap.get(item.id);
      if (!parent || !child) return true;
      parent.children.push(child);
      return false;
    });

    // Group root items by stage. Child items remain under their parent.
    const stageMap = new Map<string, Record<string, unknown>[]>();
    const stageOrder: string[] = [];

    for (const item of rootItems) {
      if (!stageMap.has(item.stageCode)) {
        stageMap.set(item.stageCode, []);
        stageOrder.push(item.stageCode);
      }
      const node = nodeMap.get(item.id);
      if (node) {
        stageMap.get(item.stageCode)?.push(node);
      }
    }

    const stages: Record<string, unknown>[] = [];
    for (const stageCode of stageOrder) {
      const stageItems = stageMap.get(stageCode);
      stages.push({
        stageCode,
        items: stageItems,
      });
    }

    return {
      projectId,
      stages,
    };
  }

  async findById(id: string, projectId: string, userId: string) {
    await this.projectAccess.assertProjectAccess(projectId, userId);
    const item = await this.prisma.projectArchiveItem.findUnique({
      where: { id, projectId },
      include: {
        responsibleUser: {
          select: { id: true, realName: true, username: true },
        },
        reviewUser: {
          select: { id: true, realName: true, username: true },
        },
        files: {
          where: { isCurrent: true },
          select: {
            id: true,
            fileName: true,
            originalName: true,
            fileExt: true,
            fileSize: true,
            mimeType: true,
            versionNo: true,
            fileStatus: true,
            uploadTime: true,
            isCurrent: true,
            remark: true,
            uploadUser: {
              select: { id: true, realName: true },
            },
          },
          orderBy: { versionNo: 'desc' },
        },
        children: {
          include: {
            responsibleUser: {
              select: { id: true, realName: true, username: true },
            },
            reviewUser: {
              select: { id: true, realName: true, username: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('档案项不存在');
    }

    return item;
  }

  async updateItem(id: string, projectId: string, dto: UpdateArchiveItemDto, userId: string) {
    await this.projectAccess.assertProjectAccess(projectId, userId);
    const item = await this.prisma.projectArchiveItem.findUnique({
      where: { id, projectId },
    });

    if (!item) {
      throw new NotFoundException('档案项不存在');
    }

    const updateData: Record<string, unknown> = {};

    if (dto.responsibleUserId !== undefined) {
      updateData.responsibleUserId = dto.responsibleUserId;
    }

    if (dto.reviewUserId !== undefined) {
      updateData.reviewUserId = dto.reviewUserId;
    }

    if (dto.status !== undefined) {
      updateData.status = dto.status;
      if (dto.status === 'Approved') {
        updateData.completedAt = new Date();
      }
    }

    if (dto.dueDate !== undefined) {
      updateData.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }

    return this.prisma.projectArchiveItem.update({
      where: { id },
      data: updateData,
    });
  }

  async markNotApplicable(id: string, projectId: string, userId: string) {
    await this.projectAccess.assertProjectAccess(projectId, userId);
    const item = await this.prisma.projectArchiveItem.findUnique({
      where: { id, projectId },
    });

    if (!item) {
      throw new NotFoundException('档案项不存在');
    }

    return this.prisma.projectArchiveItem.update({
      where: { id },
      data: {
        status: 'NotApplicable',
        completedAt: new Date(),
      },
    });
  }

  async getStatistics(projectId: string, userId: string): Promise<ArchiveStatistics> {
    await this.projectAccess.assertProjectAccess(projectId, userId);

    const items = await this.prisma.projectArchiveItem.findMany({
      where: { projectId },
      select: {
        id: true,
        stageCode: true,
        status: true,
        isRequired: true,
        isStar: true,
        children: { select: { id: true } },
      },
    });

    // Parent folders organize content; only leaf upload points participate in completion.
    const actionableItems = items.filter((item) => item.children.length === 0);
    const totalItems = actionableItems.length;
    const completedItems = actionableItems.filter(
      (i) => i.status === 'Approved' || i.status === 'NotApplicable' || i.status === 'Archived',
    ).length;
    const requiredItems = actionableItems.filter((i) => i.isRequired).length;
    const starItems = actionableItems.filter((i) => i.isStar).length;
    const completionRate = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    // Group by stage
    const stageMap = new Map<string, { totalItems: number; completedItems: number }>();
    const stageOrder: string[] = [];

    for (const item of actionableItems) {
      if (!stageMap.has(item.stageCode)) {
        stageMap.set(item.stageCode, { totalItems: 0, completedItems: 0 });
        stageOrder.push(item.stageCode);
      }

      const stage = stageMap.get(item.stageCode);
      if (!stage) {
        continue;
      }
      stage.totalItems++;
      if (
        item.status === 'Approved' ||
        item.status === 'NotApplicable' ||
        item.status === 'Archived'
      ) {
        stage.completedItems++;
      }
    }

    const stages: StageStatistics[] = [];
    for (const stageCode of stageOrder) {
      const stage = stageMap.get(stageCode);
      if (!stage) {
        continue;
      }
      stages.push({
        stageCode,
        stageName: stageCode,
        totalItems: stage.totalItems,
        completedItems: stage.completedItems,
        completionRate:
          stage.totalItems > 0 ? Math.round((stage.completedItems / stage.totalItems) * 100) : 0,
      });
    }

    return {
      totalItems,
      completedItems,
      requiredItems,
      starItems,
      completionRate,
      stages,
    };
  }
}
