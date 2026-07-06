import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, KnowledgeStatus } from '@prisma/client';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { ApprovalService } from '../platform/approval.service';

import { CreateKnowledgeArticleDto } from './dto/create-knowledge-article.dto';
import { CreateKnowledgeCategoryDto } from './dto/create-knowledge-category.dto';
import { QueryKnowledgeArticleDto } from './dto/query-knowledge-article.dto';
import { UpdateKnowledgeArticleDto } from './dto/update-knowledge-article.dto';
import { UpdateKnowledgeCategoryDto } from './dto/update-knowledge-category.dto';

interface ArticleListItem {
  id: string;
  title: string;
  countryCode: string | null;
  projectType: string | null;
  stageCode: string | null;
  applicableRole: string | null;
  contentType: string;
  fileUrl: string | null;
  fileSize: bigint | null;
  fileExt: string | null;
  sourceStatus: string;
  needsRevision: boolean;
  fileCount?: number;
  version: string;
  status: string;
  authorId: string;
  reviewerId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string } | null;
  author: { id: string; realName: string } | null;
}

interface CategoryTreeNode {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  children: CategoryTreeNode[];
}

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: ApprovalService,
  ) {}

  // ========== Category CRUD ==========

  async findAllCategories(): Promise<CategoryTreeNode[]> {
    const categories = await this.prisma.knowledgeCategory.findMany({
      where: { status: 'Active' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const uniqueCategoryMap = new Map<string, (typeof categories)[number]>();
    for (const category of categories) {
      const key = this.categoryIdentity(category.name, category.parentId);
      if (!uniqueCategoryMap.has(key)) {
        uniqueCategoryMap.set(key, category);
      }
    }
    const uniqueCategories = [...uniqueCategoryMap.values()];

    // Build tree structure
    const map = new Map<string, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    uniqueCategories.forEach((cat) => {
      map.set(cat.id, { ...cat, children: [] });
    });

    uniqueCategories.forEach((cat) => {
      const node = map.get(cat.id)!;
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  async findCategoryById(id: string) {
    const category = await this.prisma.knowledgeCategory.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true, sortOrder: true } },
      },
    });

    if (!category) {
      throw new NotFoundException('知识分类不存在');
    }

    return category;
  }

  async createCategory(dto: CreateKnowledgeCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.knowledgeCategory.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException('父分类不存在');
      }
    }
    await this.assertCategoryNameAvailable(dto.name, dto.parentId ?? null);

    return this.prisma.knowledgeCategory.create({
      data: {
        name: dto.name,
        description: dto.description,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateKnowledgeCategoryDto) {
    const existing = await this.prisma.knowledgeCategory.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('知识分类不存在');
    }
    if (dto.name) {
      await this.assertCategoryNameAvailable(dto.name, existing.parentId, id);
    }

    return this.prisma.knowledgeCategory.update({
      where: { id },
      data: dto,
    });
  }

  async deleteCategory(id: string): Promise<void> {
    const existing = await this.prisma.knowledgeCategory.findUnique({
      where: { id },
      include: { children: { select: { id: true } } },
    });

    if (!existing) {
      throw new NotFoundException('知识分类不存在');
    }

    if (existing.children.length > 0) {
      throw new BadRequestException('该分类下存在子分类，无法删除');
    }

    const articleCount = await this.prisma.knowledgeArticle.count({
      where: { categoryId: id },
    });

    if (articleCount > 0) {
      throw new BadRequestException('该分类下存在文章，无法删除');
    }

    await this.prisma.knowledgeCategory.delete({ where: { id } });
  }

  // ========== Article CRUD ==========

  async findAllArticles(
    query: QueryKnowledgeArticleDto,
  ): Promise<PaginatedResult<ArticleListItem>> {
    const {
      page = 1,
      pageSize = 20,
      categoryId,
      keyword,
      status,
      countryCode,
      projectType,
      contentType,
      sourceStatus,
    } = query;

    const where: Prisma.KnowledgeArticleWhereInput = { deletedAt: null };

    if (categoryId) {
      const childCategories = await this.prisma.knowledgeCategory.findMany({
        where: { parentId: categoryId },
        select: { id: true },
      });
      where.categoryId = {
        in: [categoryId, ...childCategories.map((item) => item.id)],
      };
    }
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { background: { contains: keyword } },
        { standardPractice: { contains: keyword } },
      ];
    }
    if (status) {
      where.status = status as KnowledgeStatus;
    }
    if (countryCode) {
      where.countryCode = countryCode;
    }
    if (projectType) {
      where.projectType = projectType;
    }
    if (contentType) {
      where.contentType = contentType;
    }
    if (sourceStatus) {
      where.sourceStatus = sourceStatus;
    }

    const [total, list] = await Promise.all([
      this.prisma.knowledgeArticle.count({ where }),
      this.prisma.knowledgeArticle.findMany({
        where,
        select: {
          id: true,
          title: true,
          countryCode: true,
          projectType: true,
          stageCode: true,
          applicableRole: true,
          contentType: true,
          fileUrl: true,
          fileSize: true,
          fileExt: true,
          sourceStatus: true,
          needsRevision: true,
          version: true,
          status: true,
          authorId: true,
          reviewerId: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          category: {
            select: { id: true, name: true },
          },
          author: {
            select: { id: true, realName: true },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    const fileCounts = list.length
      ? await this.prisma.attachment.groupBy({
          by: ['ownerId'],
          where: {
            ownerType: 'KnowledgeArticle',
            ownerId: { in: list.map((item) => item.id) },
            deletedAt: null,
          },
          _count: { _all: true },
        })
      : [];
    const fileCountByArticleId = new Map(
      fileCounts.map((item) => [item.ownerId, item._count._all]),
    );

    return {
      list: list.map((item) => ({
        ...item,
        fileCount: fileCountByArticleId.get(item.id) ?? 0,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findArticleById(id: string) {
    const article = await this.prisma.knowledgeArticle.findUnique({
      where: { id, deletedAt: null },
      include: {
        category: { select: { id: true, name: true } },
        author: { select: { id: true, realName: true, username: true } },
        reviewer: { select: { id: true, realName: true, username: true } },
        versions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            version: true,
            changeNotes: true,
            createdAt: true,
            creator: { select: { id: true, realName: true } },
          },
        },
      },
    });

    if (!article) {
      throw new NotFoundException('知识文章不存在');
    }

    return article;
  }

  async createArticle(dto: CreateKnowledgeArticleDto, authorId: string) {
    const category = await this.prisma.knowledgeCategory.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category) {
      throw new NotFoundException('知识分类不存在');
    }

    return this.prisma.knowledgeArticle.create({
      data: {
        categoryId: dto.categoryId,
        title: dto.title,
        countryCode: dto.countryCode,
        projectType: dto.projectType,
        stageCode: dto.stageCode,
        applicableRole: dto.applicableRole,
        background: dto.background,
        standardPractice: dto.standardPractice,
        steps: dto.steps,
        notes: dto.notes,
        commonMistakes: dto.commonMistakes,
        relatedFlow: dto.relatedFlow,
        relatedChecklist: dto.relatedChecklist,
        relatedTemplate: dto.relatedTemplate,
        contentType: dto.contentType ?? 'article',
        fileUrl: dto.fileUrl,
        fileSize: dto.fileSize,
        fileExt: dto.fileExt,
        markdownContent: dto.markdownContent,
        sourceStatus: dto.sourceStatus ?? 'Ready',
        needsRevision: dto.needsRevision ?? false,
        authorId,
        status: 'Draft' as KnowledgeStatus,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });
  }

  async updateArticle(id: string, dto: UpdateKnowledgeArticleDto) {
    const existing = await this.prisma.knowledgeArticle.findUnique({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('知识文章不存在');
    }

    if (dto.categoryId) {
      const category = await this.prisma.knowledgeCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('知识分类不存在');
      }
    }

    return this.prisma.knowledgeArticle.update({
      where: { id, deletedAt: null },
      data: {
        ...dto,
        // Reset to Draft if Published when edited
        ...(existing.status === 'Published' ? { status: 'Draft' as KnowledgeStatus } : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });
  }

  async deleteArticle(id: string): Promise<void> {
    const existing = await this.prisma.knowledgeArticle.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('知识文章不存在');
    }

    await this.prisma.knowledgeArticle.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async publishArticle(id: string, userId: string) {
    const article = await this.prisma.knowledgeArticle.findUnique({
      where: { id, deletedAt: null },
    });

    if (!article) {
      throw new NotFoundException('知识文章不存在');
    }

    if (article.status === 'Published') {
      throw new BadRequestException('文章已发布');
    }

    if (article.status === 'Reviewing') {
      throw new BadRequestException('文章正在审核中');
    }

    return this.approvalService.startBusinessApproval({
      businessType: 'knowledge',
      businessId: article.id,
      businessTitle: article.title,
      applicantId: userId,
      countryCode: article.countryCode ?? undefined,
    });
  }

  async deprecateArticle(id: string) {
    const article = await this.prisma.knowledgeArticle.findUnique({
      where: { id, deletedAt: null },
    });

    if (!article) {
      throw new NotFoundException('知识文章不存在');
    }

    if (article.status === 'Deprecated') {
      throw new BadRequestException('文章已废弃');
    }

    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: {
        status: 'Deprecated' as KnowledgeStatus,
      },
    });
  }

  async findVersions(id: string) {
    const article = await this.prisma.knowledgeArticle.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!article) {
      throw new NotFoundException('知识文章不存在');
    }
    return this.prisma.knowledgeArticleVersion.findMany({
      where: { articleId: id },
      include: {
        creator: { select: { id: true, realName: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private categoryIdentity(name: string, parentId: string | null): string {
    return `${parentId ?? 'root'}::${name.trim().toLowerCase()}`;
  }

  private async assertCategoryNameAvailable(
    name: string,
    parentId: string | null,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.knowledgeCategory.findFirst({
      where: {
        name: name.trim(),
        parentId,
        status: 'Active',
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('同一层级下已存在同名知识分类');
    }
  }
}
