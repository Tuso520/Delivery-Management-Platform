import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import {
  CreateArchiveTemplateDto,
  CreateArchiveTemplateItemDto,
  UpdateArchiveTemplateDto,
  UpdateArchiveTemplateItemDto,
  QueryArchiveTemplateDto,
} from './dto/archive-template.dto';

@Injectable()
export class ArchiveTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryArchiveTemplateDto) {
    const where: Record<string, unknown> = {
      status: 'Active',
    };

    if (query.projectType) {
      where.projectType = query.projectType;
    }

    if (query.countryCode) {
      where.countryCode = query.countryCode;
    }

    if (query.languageCode) {
      where.languageCode = query.languageCode;
    }

    return this.prisma.archiveTemplate.findMany({
      where,
      select: {
        id: true,
        templateCode: true,
        templateName: true,
        projectType: true,
        countryCode: true,
        languageCode: true,
        version: true,
        status: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const template = await this.prisma.archiveTemplate.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: [{ stageCode: 'asc' }, { sortOrder: 'asc' }, { itemNo: 'asc' }],
        },
      },
    });

    if (!template) {
      throw new NotFoundException('档案模板不存在');
    }

    return template;
  }

  async create(dto: CreateArchiveTemplateDto) {
    const existing = await this.prisma.archiveTemplate.findUnique({
      where: { templateCode: dto.templateCode },
    });

    if (existing) {
      throw new ConflictException('模板编码已存在');
    }

    return this.prisma.archiveTemplate.create({
      data: {
        templateCode: dto.templateCode,
        templateName: dto.templateName,
        projectType: dto.projectType,
        countryCode: dto.countryCode,
        languageCode: dto.languageCode,
        version: dto.version || 'V1.0',
        description: dto.description,
        status: 'Active',
      },
    });
  }

  async update(id: string, dto: UpdateArchiveTemplateDto) {
    const template = await this.prisma.archiveTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException('档案模板不存在');
    }

    return this.prisma.archiveTemplate.update({
      where: { id },
      data: {
        templateName: dto.templateName,
        projectType: dto.projectType,
        countryCode: dto.countryCode,
        languageCode: dto.languageCode,
        version: dto.version,
        status: dto.status,
        description: dto.description,
      },
    });
  }

  async delete(id: string): Promise<void> {
    const template = await this.prisma.archiveTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException('档案模板不存在');
    }

    await this.prisma.archiveTemplate.update({
      where: { id },
      data: { status: 'Inactive' },
    });
  }

  async findItems(templateId: string, buildTree = false) {
    const template = await this.prisma.archiveTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('档案模板不存在');
    }

    const items = await this.prisma.archiveTemplateItem.findMany({
      where: { templateId },
      orderBy: [{ stageCode: 'asc' }, { sortOrder: 'asc' }, { itemNo: 'asc' }],
    });

    if (!buildTree) {
      return items;
    }

    // Build tree structure
    const itemMap = new Map<string, Record<string, unknown>>();
    const roots: Record<string, unknown>[] = [];

    for (const item of items) {
      itemMap.set(item.id, { ...item, children: [] });
    }

    for (const item of items) {
      const node = itemMap.get(item.id);
      if (!node) {
        continue;
      }
      if (item.parentId && itemMap.has(item.parentId)) {
        const parent = itemMap.get(item.parentId);
        if (!parent) {
          continue;
        }
        (parent.children as unknown[]).push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async createItem(templateId: string, dto: CreateArchiveTemplateItemDto) {
    await this.assertTemplate(templateId);
    const parent = dto.parentId
      ? await this.prisma.archiveTemplateItem.findUnique({
          where: { id: dto.parentId },
          select: { id: true, templateId: true, level: true },
        })
      : null;
    if (dto.parentId && (!parent || parent.templateId !== templateId)) {
      throw new BadRequestException('父级目录项不属于当前模板');
    }
    const maximum = await this.prisma.archiveTemplateItem.aggregate({
      where: { templateId, stageCode: dto.stageCode },
      _max: { itemNo: true },
    });
    return this.prisma.archiveTemplateItem.create({
      data: {
        templateId,
        parentId: parent?.id ?? null,
        stageCode: dto.stageCode,
        itemNo: (maximum._max.itemNo ?? 0) + 1,
        level: parent ? parent.level + 1 : (dto.level ?? 1),
        name: dto.name,
        secondName: dto.secondName,
        usageDescription: dto.usageDescription,
        isRequired: dto.isRequired ?? true,
        isStar: dto.isStar ?? false,
        isSensitive: dto.isSensitive ?? false,
        needReview: dto.needReview ?? false,
        responsibleRole: dto.responsibleRole,
        reviewRole: dto.reviewRole,
        allowedFileTypes: dto.evidenceFileTypes?.join(','),
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateItem(itemId: string, dto: UpdateArchiveTemplateItemDto) {
    const item = await this.prisma.archiveTemplateItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException('档案模板目录项不存在');
    }
    if (dto.parentId === itemId) {
      throw new BadRequestException('目录项不能将自身设为父级');
    }
    const parent = dto.parentId
      ? await this.prisma.archiveTemplateItem.findUnique({
          where: { id: dto.parentId },
          select: { id: true, templateId: true, level: true },
        })
      : null;
    if (dto.parentId && (!parent || parent.templateId !== item.templateId)) {
      throw new BadRequestException('父级目录项不属于当前模板');
    }
    const data: Prisma.ArchiveTemplateItemUncheckedUpdateInput = {
      ...(dto.parentId !== undefined && { parentId: parent?.id ?? null }),
      ...(dto.stageCode !== undefined && { stageCode: dto.stageCode }),
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.secondName !== undefined && { secondName: dto.secondName }),
      ...(dto.usageDescription !== undefined && {
        usageDescription: dto.usageDescription,
      }),
      ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
      ...(dto.isStar !== undefined && { isStar: dto.isStar }),
      ...(dto.isSensitive !== undefined && {
        isSensitive: dto.isSensitive,
      }),
      ...(dto.needReview !== undefined && { needReview: dto.needReview }),
      ...(dto.responsibleRole !== undefined && {
        responsibleRole: dto.responsibleRole,
      }),
      ...(dto.reviewRole !== undefined && { reviewRole: dto.reviewRole }),
      ...(dto.evidenceFileTypes !== undefined && {
        allowedFileTypes: dto.evidenceFileTypes.join(','),
      }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      ...(dto.parentId !== undefined && {
        level: parent ? parent.level + 1 : 1,
      }),
    };
    return this.prisma.archiveTemplateItem.update({
      where: { id: itemId },
      data,
    });
  }

  async deleteItem(itemId: string): Promise<void> {
    const item = await this.prisma.archiveTemplateItem.findUnique({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException('档案模板目录项不存在');
    }
    const [childCount, usageCount] = await Promise.all([
      this.prisma.archiveTemplateItem.count({ where: { parentId: itemId } }),
      this.prisma.projectArchiveItem.count({
        where: { templateItemId: itemId },
      }),
    ]);
    if (childCount > 0) {
      throw new BadRequestException('请先删除该目录项的下级项目');
    }
    if (usageCount > 0) {
      throw new BadRequestException('目录项已用于项目档案，不能删除');
    }
    await this.prisma.archiveTemplateItem.delete({ where: { id: itemId } });
  }

  private async assertTemplate(id: string): Promise<void> {
    const template = await this.prisma.archiveTemplate.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!template) {
      throw new NotFoundException('档案模板不存在');
    }
  }
}
