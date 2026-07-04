import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import { CreateToolCategoryDto } from './dto/create-tool-category.dto';
import { CreateToolItemDto } from './dto/create-tool-item.dto';
import { UpdateToolCategoryDto } from './dto/update-tool-category.dto';
import { UpdateToolItemDto } from './dto/update-tool-item.dto';

@Injectable()
export class ToolService {
  constructor(private readonly prisma: PrismaService) {}

  // ========== Category CRUD ==========

  async findAllCategories() {
    return this.prisma.toolCategory.findMany({
      where: { status: 'Active' },
      orderBy: { sortOrder: 'asc' },
      include: {
        tools: {
          where: { status: 'Active' },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            toolType: true,
            sortOrder: true,
          },
        },
      },
    });
  }

  async findCategoryById(id: string) {
    const category = await this.prisma.toolCategory.findUnique({
      where: { id },
      include: {
        tools: {
          where: { status: 'Active' },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('工具分类不存在');
    }

    return category;
  }

  async createCategory(dto: CreateToolCategoryDto) {
    return this.prisma.toolCategory.create({
      data: {
        name: dto.name,
        description: dto.description,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateToolCategoryDto) {
    const existing = await this.prisma.toolCategory.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('工具分类不存在');
    }

    return this.prisma.toolCategory.update({
      where: { id },
      data: dto,
    });
  }

  async deleteCategory(id: string): Promise<void> {
    const existing = await this.prisma.toolCategory.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('工具分类不存在');
    }

    const toolCount = await this.prisma.toolItem.count({
      where: { categoryId: id },
    });

    if (toolCount > 0) {
      throw new BadRequestException('该分类下存在工具，无法删除');
    }

    await this.prisma.toolCategory.delete({ where: { id } });
  }

  // ========== ToolItem CRUD ==========

  async findAllTools(categoryId?: string) {
    const where: Prisma.ToolItemWhereInput = {};

    if (categoryId) {
      where.categoryId = categoryId;
    }

    return this.prisma.toolItem.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async findToolById(id: string) {
    const tool = await this.prisma.toolItem.findUnique({
      where: { id },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    if (!tool) {
      throw new NotFoundException('工具不存在');
    }

    return tool;
  }

  async createTool(dto: CreateToolItemDto) {
    const category = await this.prisma.toolCategory.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category) {
      throw new NotFoundException('工具分类不存在');
    }

    return this.prisma.toolItem.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        toolType: dto.toolType ?? 'internal',
        url: dto.url,
        icon: dto.icon,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async updateTool(id: string, dto: UpdateToolItemDto) {
    const existing = await this.prisma.toolItem.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('工具不存在');
    }

    if (dto.categoryId) {
      const category = await this.prisma.toolCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('工具分类不存在');
      }
    }

    return this.prisma.toolItem.update({
      where: { id },
      data: dto,
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async deleteTool(id: string): Promise<void> {
    const existing = await this.prisma.toolItem.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('工具不存在');
    }

    await this.prisma.toolItem.delete({ where: { id } });
  }
}
