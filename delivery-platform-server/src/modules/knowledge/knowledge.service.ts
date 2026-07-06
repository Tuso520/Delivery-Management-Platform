import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, KnowledgeStatus } from '@prisma/client';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { AttachmentService } from '../attachment/attachment.service';
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
  files?: KnowledgeAttachmentSummary[];
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

interface KnowledgeAttachmentSummary {
  id: string;
  ownerType: string;
  ownerId: string;
  category: string | null;
  originalName: string;
  fileExt: string;
  fileSize: bigint;
  mimeType: string;
  createdAt: Date;
  uploader: { id: string; realName: string; username: string } | null;
}

interface FileRevisionPayload {
  revisionType?: string;
  articleId?: string;
  originalAttachmentId?: string;
  originalName?: string;
  submittedAt?: string;
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
    private readonly attachmentService?: AttachmentService,
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
    const files = list.length
      ? await this.prisma.attachment.findMany({
          where: {
            ownerType: 'KnowledgeArticle',
            ownerId: { in: list.map((item) => item.id) },
            deletedAt: null,
          },
          include: {
            uploader: { select: { id: true, realName: true, username: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const filesByArticleId = new Map<string, KnowledgeAttachmentSummary[]>();
    for (const file of files) {
      const listForArticle = filesByArticleId.get(file.ownerId) ?? [];
      listForArticle.push(file);
      filesByArticleId.set(file.ownerId, listForArticle);
    }

    return {
      list: list.map((item) => {
        const articleFiles = filesByArticleId.get(item.id) ?? [];
        return {
          ...item,
          fileCount: articleFiles.length,
          files: articleFiles,
        };
      }),
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

  async submitFileRevision(
    articleId: string,
    attachmentId: string,
    file: Express.Multer.File,
    userId: string,
  ) {
    if (!this.attachmentService) {
      throw new BadRequestException('知识库附件服务未启用');
    }

    const [article, original] = await Promise.all([
      this.prisma.knowledgeArticle.findFirst({
        where: { id: articleId, deletedAt: null },
        select: { id: true, title: true, countryCode: true },
      }),
      this.prisma.attachment.findFirst({
        where: {
          id: attachmentId,
          ownerType: 'KnowledgeArticle',
          ownerId: articleId,
          deletedAt: null,
        },
        select: {
          id: true,
          originalName: true,
          fileExt: true,
          fileSize: true,
          mimeType: true,
        },
      }),
    ]);

    if (!article || !original) {
      throw new NotFoundException('知识库文件不存在');
    }

    const pendingRevision = await this.prisma.attachment.findFirst({
      where: {
        ownerType: 'KnowledgeFileRevision',
        ownerId: attachmentId,
        deletedAt: null,
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (pendingRevision) {
      const pendingTask = await this.prisma.approvalTask.findFirst({
        where: {
          businessType: 'knowledge-file-update',
          businessId: pendingRevision.id,
          status: 'Pending',
        },
        select: { id: true },
      });
      if (pendingTask) {
        throw new ConflictException('该文件已有待审批的更新申请');
      }
    }

    const payload: FileRevisionPayload = {
      revisionType: 'knowledge-file-update',
      articleId,
      originalAttachmentId: attachmentId,
      originalName: original.originalName,
      submittedAt: new Date().toISOString(),
    };
    const [revision] = await this.attachmentService.uploadMany(
      [file],
      {
        ownerType: 'KnowledgeFileRevision',
        ownerId: attachmentId,
        category: 'revision',
        remark: JSON.stringify(payload),
      },
      userId,
    );
    const approvalTemplate = await this.prisma.approvalTemplate.findFirst({
      where: { businessType: 'knowledge-file-update', isEnabled: true },
      select: { id: true },
    });

    return this.approvalService.startBusinessApproval({
      businessType: 'knowledge-file-update',
      businessId: revision.id,
      businessTitle: `知识库文件更新：${original.originalName}`,
      applicantId: userId,
      countryCode: article.countryCode ?? undefined,
      approverIds: approvalTemplate ? undefined : [userId],
    });
  }

  async findFileRevisionDiff(revisionId: string) {
    const revision = await this.prisma.attachment.findFirst({
      where: {
        id: revisionId,
        ownerType: 'KnowledgeFileRevision',
        deletedAt: null,
      },
      include: {
        uploader: { select: { id: true, realName: true, username: true } },
      },
    });

    if (!revision) {
      throw new NotFoundException('文件更新申请不存在');
    }

    const payload = this.parseFileRevisionPayload(revision.remark);
    const originalAttachmentId = payload.originalAttachmentId ?? revision.ownerId;
    const original = await this.prisma.attachment.findFirst({
      where: {
        id: originalAttachmentId,
        ownerType: 'KnowledgeArticle',
        deletedAt: null,
      },
      include: {
        uploader: { select: { id: true, realName: true, username: true } },
      },
    });

    if (!original) {
      throw new NotFoundException('原知识库文件不存在');
    }

    const articleId = payload.articleId ?? original.ownerId;
    const article = await this.prisma.knowledgeArticle.findFirst({
      where: { id: articleId, deletedAt: null },
      select: {
        id: true,
        title: true,
        version: true,
        status: true,
        category: { select: { id: true, name: true } },
      },
    });

    return {
      article,
      original: this.toAttachmentSummary(original),
      incoming: this.toAttachmentSummary(revision),
      changes: [
        this.diffField('文件名', original.originalName, revision.originalName),
        this.diffField('扩展名', original.fileExt, revision.fileExt),
        this.diffField('文件大小', String(original.fileSize), String(revision.fileSize)),
        this.diffField('MIME 类型', original.mimeType, revision.mimeType),
      ],
      submittedAt: payload.submittedAt ?? revision.createdAt,
    };
  }

  private parseFileRevisionPayload(remark?: string | null): FileRevisionPayload {
    if (!remark) return {};
    try {
      const parsed = JSON.parse(remark);
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
      return {};
    }
  }

  private toAttachmentSummary(attachment: KnowledgeAttachmentSummary) {
    return {
      id: attachment.id,
      ownerType: attachment.ownerType,
      ownerId: attachment.ownerId,
      category: attachment.category,
      originalName: attachment.originalName,
      fileExt: attachment.fileExt,
      fileSize: String(attachment.fileSize),
      mimeType: attachment.mimeType,
      createdAt: attachment.createdAt,
      uploader: attachment.uploader,
    };
  }

  private diffField(label: string, before: string, after: string) {
    return {
      label,
      before,
      after,
      changed: before !== after,
    };
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
