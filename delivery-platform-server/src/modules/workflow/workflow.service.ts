import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../database/prisma.service';

import {
  CreateWorkflowCategoryDto,
  UpdateWorkflowCategoryDto,
  CreateWorkflowDocumentDto,
  UpdateWorkflowDocumentDto,
  QueryWorkflowDocumentDto,
} from './dto/workflow.dto';

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== Categories ====================

  async findAllCategories() {
    return this.prisma.workflowCategory.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        sortOrder: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { documents: true },
        },
        documents: {
          select: {
            id: true,
            name: true,
            version: true,
            status: true,
            responsibleRole: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findCategoryById(id: string) {
    const category = await this.prisma.workflowCategory.findUnique({
      where: { id },
      include: {
        documents: {
          select: {
            id: true,
            name: true,
            version: true,
            status: true,
            responsibleRole: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('流程分类不存在');
    }

    return category;
  }

  async createCategory(dto: CreateWorkflowCategoryDto) {
    return this.prisma.workflowCategory.create({
      data: {
        name: dto.name,
        description: dto.description,
        sortOrder: dto.sortOrder ?? 0,
      },
      select: {
        id: true,
        name: true,
        description: true,
        sortOrder: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateWorkflowCategoryDto) {
    const category = await this.prisma.workflowCategory.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('流程分类不存在');
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) data.status = dto.status;

    return this.prisma.workflowCategory.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        description: true,
        sortOrder: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  async deleteCategory(id: string): Promise<void> {
    const category = await this.prisma.workflowCategory.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('流程分类不存在');
    }

    const docCount = await this.prisma.workflowDocument.count({
      where: { categoryId: id },
    });
    if (docCount > 0) {
      throw new BadRequestException('该分类下还有文档，无法删除');
    }

    await this.prisma.workflowCategory.delete({ where: { id } });
  }

  // ==================== Documents ====================

  async findAllDocuments(query: QueryWorkflowDocumentDto): Promise<PaginatedResult<unknown>> {
    const { page = 1, pageSize = 20, categoryId, keyword, status } = query;

    const where: Record<string, unknown> = {};

    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (status) {
      where.status = status;
    }
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { applicableScope: { contains: keyword } },
      ];
    }

    const [total, list] = await Promise.all([
      this.prisma.workflowDocument.count({ where }),
      this.prisma.workflowDocument.findMany({
        where,
        select: {
          id: true,
          categoryId: true,
          name: true,
          responsibleRole: true,
          version: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          category: {
            select: { id: true, name: true },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      list: list.map((doc) => ({
        id: doc.id,
        categoryId: doc.categoryId,
        name: doc.name,
        responsibleRole: doc.responsibleRole,
        version: doc.version,
        status: doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        category: doc.category,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findDocumentById(id: string) {
    const doc = await this.prisma.workflowDocument.findUnique({
      where: { id },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    if (!doc) {
      throw new NotFoundException('流程文档不存在');
    }

    return doc;
  }

  async createDocument(dto: CreateWorkflowDocumentDto) {
    const category = await this.prisma.workflowCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException('流程分类不存在');
    }

    return this.prisma.workflowDocument.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        applicableScope: dto.applicableScope,
        triggerCondition: dto.triggerCondition,
        inputMaterials: dto.inputMaterials,
        outputMaterials: dto.outputMaterials,
        responsibleRole: dto.responsibleRole,
        steps: dto.steps,
        relatedChecklist: dto.relatedChecklist,
        relatedTemplates: dto.relatedTemplates,
        relatedArchive: dto.relatedArchive,
        riskNotes: dto.riskNotes,
        version: dto.version || 'V1.0',
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async updateDocument(id: string, dto: UpdateWorkflowDocumentDto) {
    const doc = await this.prisma.workflowDocument.findUnique({ where: { id } });
    if (!doc) {
      throw new NotFoundException('流程文档不存在');
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.applicableScope !== undefined) data.applicableScope = dto.applicableScope;
    if (dto.triggerCondition !== undefined) data.triggerCondition = dto.triggerCondition;
    if (dto.inputMaterials !== undefined) data.inputMaterials = dto.inputMaterials;
    if (dto.outputMaterials !== undefined) data.outputMaterials = dto.outputMaterials;
    if (dto.responsibleRole !== undefined) data.responsibleRole = dto.responsibleRole;
    if (dto.steps !== undefined) data.steps = dto.steps;
    if (dto.relatedChecklist !== undefined) data.relatedChecklist = dto.relatedChecklist;
    if (dto.relatedTemplates !== undefined) data.relatedTemplates = dto.relatedTemplates;
    if (dto.relatedArchive !== undefined) data.relatedArchive = dto.relatedArchive;
    if (dto.riskNotes !== undefined) data.riskNotes = dto.riskNotes;
    if (dto.version !== undefined) data.version = dto.version;
    if (dto.status !== undefined) data.status = dto.status;

    return this.prisma.workflowDocument.update({
      where: { id },
      data,
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async deleteDocument(id: string): Promise<void> {
    const doc = await this.prisma.workflowDocument.findUnique({ where: { id } });
    if (!doc) {
      throw new NotFoundException('流程文档不存在');
    }

    await this.prisma.workflowDocument.delete({ where: { id } });
  }

  async search(keyword: string) {
    if (!keyword || keyword.trim().length === 0) {
      return [];
    }

    return this.prisma.workflowDocument.findMany({
      where: {
        OR: [
          { name: { contains: keyword } },
          { applicableScope: { contains: keyword } },
          { triggerCondition: { contains: keyword } },
        ],
        status: 'Active',
      },
      select: {
        id: true,
        name: true,
        version: true,
        responsibleRole: true,
        category: {
          select: { id: true, name: true },
        },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  }
}
