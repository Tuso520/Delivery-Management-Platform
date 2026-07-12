import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ReviewConfigurationService } from '../review/review-configuration.service';
import { ReviewTaskService } from '../review/review-task.service';
import { SystemConfigService } from '../system-config/system-config.service';

import {
  CreateKnowledgeItemDto,
  CreateKnowledgeVersionDto,
  QueryKnowledgeItemDto,
  SubmitKnowledgeReviewDto,
  UpdateKnowledgeItemDto,
} from './dto/knowledge-item.dto';

type KnowledgeActor = Pick<JwtPayload, 'sub' | 'permissions'>;
type KnowledgeContentType = 'FILE' | 'MARKDOWN' | 'LINK';

interface KnowledgeContent {
  contentType: KnowledgeContentType;
  fileVersionId: string | null;
  markdownContent: string | null;
  externalUrl: string | null;
}

interface KnowledgeCategoryNode {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  children: KnowledgeCategoryNode[];
}

const editableVersionStatuses = new Set(['DRAFT', 'REJECTED']);
const managerPermissions = new Set(['knowledge:publish', 'knowledge:archive']);

@Injectable()
export class KnowledgeItemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewConfiguration: ReviewConfigurationService,
    private readonly reviewTasks: ReviewTaskService,
    @Optional() private readonly systemConfig?: SystemConfigService,
  ) {}

  async getSummary(actor: KnowledgeActor) {
    const visibility = await this.buildVisibilityWhere(actor);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [groups, thisMonthNew] = await Promise.all([
      this.prisma.knowledgeItem.groupBy({
        by: ['status'],
        where: visibility,
        _count: { _all: true },
      }),
      this.prisma.knowledgeItem.count({
        where: { AND: [visibility, { createdAt: { gte: monthStart } }] },
      }),
    ]);
    const counts = new Map(groups.map((group) => [group.status, group._count._all]));
    const draft = counts.get('DRAFT') ?? 0;
    const inReview = counts.get('IN_REVIEW') ?? 0;
    const rejected = counts.get('REJECTED') ?? 0;
    const published = counts.get('PUBLISHED') ?? 0;
    const archived = counts.get('ARCHIVED') ?? 0;
    return {
      total: draft + inReview + rejected + published + archived,
      draft,
      inReview,
      rejected,
      published,
      archived,
      thisMonthNew,
    };
  }

  async findAll(query: QueryKnowledgeItemDto, actor: KnowledgeActor) {
    const page = query.page ?? 1;
    const pageSize =
      query.pageSize ??
      (this.systemConfig ? await this.systemConfig.getDefaultKnowledgePageSize() : 20);
    const visibility = await this.buildVisibilityWhere(actor);
    const where: Prisma.KnowledgeItemWhereInput = {
      AND: [
        visibility,
        {
          ...(query.status ? { status: query.status } : {}),
          archivedAt: query.status === 'ARCHIVED' ? { not: null } : null,
          ...(query.categoryId ? { categoryId: query.categoryId } : {}),
          ...(query.contentType ? { contentType: query.contentType } : {}),
          ...(query.keyword
            ? {
                OR: [
                  { title: { contains: query.keyword } },
                  { summary: { contains: query.keyword } },
                  {
                    versions: {
                      some: {
                        OR: [
                          {
                            fileVersion: {
                              asset: { originalName: { contains: query.keyword } },
                            },
                          },
                          {
                            supportingFiles: {
                              some: {
                                fileVersion: {
                                  asset: { originalName: { contains: query.keyword } },
                                },
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              }
            : {}),
        },
      ],
    };
    const [total, list] = await Promise.all([
      this.prisma.knowledgeItem.count({ where }),
      this.prisma.knowledgeItem.findMany({
        where,
        select: {
          id: true,
          title: true,
          categoryId: true,
          summary: true,
          contentType: true,
          status: true,
          effectiveAt: true,
          createdBy: true,
          updatedBy: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
          category: { select: { id: true, name: true } },
          creator: { select: { id: true, realName: true } },
          updater: { select: { id: true, realName: true } },
          currentPublishedVersion: {
            select: {
              id: true,
              version: true,
              contentType: true,
              status: true,
              publishedAt: true,
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    return {
      items: list,
      page,
      pageSize,
      total,
    };
  }

  async findCategories(): Promise<KnowledgeCategoryNode[]> {
    const categories = await this.prisma.knowledgeCategory.findMany({
      where: { status: 'Active' },
      select: {
        id: true,
        name: true,
        description: true,
        parentId: true,
        sortOrder: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const nodes = new Map<string, KnowledgeCategoryNode>(
      categories.map((category) => [category.id, { ...category, children: [] }]),
    );
    const roots: KnowledgeCategoryNode[] = [];
    for (const category of categories) {
      const node = nodes.get(category.id);
      if (!node) continue;
      const parent = category.parentId ? nodes.get(category.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async create(dto: CreateKnowledgeItemDto, actor: KnowledgeActor) {
    await this.assertCategory(dto.categoryId);
    const content = this.normalizeContent({
      contentType: dto.contentType,
      fileVersionId: dto.fileVersionId ?? null,
      markdownContent: dto.markdownContent ?? null,
      externalUrl: dto.externalUrl ?? null,
    });
    const supportingIds = Array.from(new Set(dto.supportingFileVersionIds ?? []));
    this.assertSupportingFiles(content.fileVersionId, supportingIds);
    await this.assertFileVersionsAccessible(
      [content.fileVersionId, ...supportingIds].filter((id): id is string => Boolean(id)),
      actor,
    );
    const itemId = await this.prisma.$transaction(async (tx) => {
      const item = await tx.knowledgeItem.create({
        data: {
          title: dto.title.trim(),
          categoryId: dto.categoryId,
          summary: dto.summary?.trim(),
          contentType: content.contentType,
          status: 'DRAFT',
          effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : undefined,
          createdBy: actor.sub,
          updatedBy: actor.sub,
        },
        select: { id: true },
      });
      const version = await tx.knowledgeVersion.create({
        data: {
          knowledgeItemId: item.id,
          version: dto.version?.trim() || 'V1.0',
          contentType: content.contentType,
          fileVersionId: content.fileVersionId,
          markdownContent: content.markdownContent,
          externalUrl: content.externalUrl,
          status: 'DRAFT',
          changeDescription: dto.changeDescription,
          submittedBy: actor.sub,
        },
        select: { id: true },
      });
      if (supportingIds.length > 0) {
        await tx.knowledgeVersionFile.createMany({
          data: supportingIds.map((fileVersionId, sortOrder) => ({
            knowledgeVersionId: version.id,
            fileVersionId,
            role: 'SUPPORTING',
            sortOrder,
          })),
        });
      }
      await this.bindFileVersions(
        tx,
        [content.fileVersionId, ...supportingIds].filter((id): id is string => Boolean(id)),
        item.id,
        actor.sub,
      );
      return item.id;
    });
    return this.findById(itemId, actor);
  }

  async findById(id: string, actor: KnowledgeActor) {
    const visibility = await this.buildVisibilityWhere(actor);
    const item = await this.prisma.knowledgeItem.findFirst({
      where: { AND: [{ id }, visibility] },
      select: {
        id: true,
        title: true,
        categoryId: true,
        summary: true,
        contentType: true,
        status: true,
        currentPublishedVersionId: true,
        effectiveAt: true,
        createdBy: true,
        updatedBy: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true } },
        creator: { select: { id: true, realName: true } },
        updater: { select: { id: true, realName: true } },
      },
    });
    if (!item) {
      throw new NotFoundException('知识条目不存在');
    }
    const visibleVersionIds = await this.findAssignedVersionIds(actor);
    const canSeeDrafts = this.isManager(actor) || item.createdBy === actor.sub;
    const versions = await this.prisma.knowledgeVersion.findMany({
      where: {
        knowledgeItemId: id,
        ...(canSeeDrafts
          ? {}
          : {
              OR: [
                { status: 'PUBLISHED' },
                ...(visibleVersionIds.length > 0 ? [{ id: { in: visibleVersionIds } }] : []),
              ],
            }),
      },
      include: {
        fileVersion: {
          include: {
            asset: {
              select: {
                id: true,
                originalName: true,
                extension: true,
                mimeType: true,
                size: true,
              },
            },
          },
        },
        supportingFiles: {
          include: {
            fileVersion: {
              include: {
                asset: {
                  select: {
                    id: true,
                    originalName: true,
                    extension: true,
                    mimeType: true,
                    size: true,
                  },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        submitter: { select: { id: true, realName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { ...item, versions };
  }

  async update(id: string, dto: UpdateKnowledgeItemDto, actor: KnowledgeActor) {
    await this.findEditableMaster(id, actor);
    if (dto.categoryId) {
      await this.assertCategory(dto.categoryId);
    }
    await this.prisma.knowledgeItem.update({
      where: { id },
      data: {
        updatedBy: actor.sub,
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary?.trim() || null } : {}),
        ...(dto.effectiveAt !== undefined
          ? {
              effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : null,
            }
          : {}),
      },
    });
    return this.findById(id, actor);
  }

  async createVersion(itemId: string, dto: CreateKnowledgeVersionDto, actor: KnowledgeActor) {
    const item = await this.findEditableMaster(itemId, actor, true);
    const activeDraft = await this.prisma.knowledgeVersion.findFirst({
      where: {
        knowledgeItemId: itemId,
        archivedAt: null,
        status: { in: ['DRAFT', 'IN_REVIEW'] },
      },
      select: { id: true },
    });
    if (activeDraft) {
      throw new ConflictException('该知识条目已有草稿或审核中版本');
    }
    const source = item.currentPublishedVersionId
      ? await this.prisma.knowledgeVersion.findUnique({
          where: { id: item.currentPublishedVersionId },
          include: {
            supportingFiles: {
              select: { fileVersionId: true, role: true, sortOrder: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        })
      : await this.prisma.knowledgeVersion.findFirst({
          where: { knowledgeItemId: itemId, archivedAt: null },
          include: {
            supportingFiles: {
              select: { fileVersionId: true, role: true, sortOrder: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        });
    if (!source) {
      throw new NotFoundException('知识条目源版本不存在');
    }
    const contentType = (dto.contentType ?? source.contentType) as KnowledgeContentType;
    const sameType = contentType === source.contentType;
    const content = this.normalizeContent({
      contentType,
      fileVersionId:
        dto.fileVersionId === undefined
          ? sameType
            ? source.fileVersionId
            : null
          : dto.fileVersionId,
      markdownContent:
        dto.markdownContent === undefined
          ? sameType
            ? source.markdownContent
            : null
          : dto.markdownContent,
      externalUrl:
        dto.externalUrl === undefined ? (sameType ? source.externalUrl : null) : dto.externalUrl,
    });
    const supportingFiles =
      dto.supportingFileVersionIds === undefined
        ? source.supportingFiles
        : Array.from(new Set(dto.supportingFileVersionIds)).map((fileVersionId, sortOrder) => ({
            fileVersionId,
            role: 'SUPPORTING',
            sortOrder,
          }));
    const supportingIds = supportingFiles.map((file) => file.fileVersionId);
    this.assertSupportingFiles(content.fileVersionId, supportingIds);
    await this.assertFileVersionsAccessible(
      [content.fileVersionId, ...supportingIds].filter((id): id is string => Boolean(id)),
      actor,
    );
    const version = dto.version?.trim() || (await this.nextVersion(itemId));
    await this.assertVersionAvailable(itemId, version);
    const created = await this.prisma.$transaction(async (tx) => {
      const record = await tx.knowledgeVersion.create({
        data: {
          knowledgeItemId: itemId,
          version,
          contentType: content.contentType,
          fileVersionId: content.fileVersionId,
          markdownContent: content.markdownContent,
          externalUrl: content.externalUrl,
          status: 'DRAFT',
          changeDescription: dto.changeDescription,
          submittedBy: actor.sub,
        },
      });
      if (supportingFiles.length > 0) {
        await tx.knowledgeVersionFile.createMany({
          data: supportingFiles.map((file) => ({
            knowledgeVersionId: record.id,
            fileVersionId: file.fileVersionId,
            role: file.role,
            sortOrder: file.sortOrder,
          })),
        });
      }
      await this.bindFileVersions(
        tx,
        [content.fileVersionId, ...supportingIds].filter((id): id is string => Boolean(id)),
        itemId,
        actor.sub,
      );
      await tx.knowledgeItem.update({
        where: { id: itemId },
        data: { updatedBy: actor.sub, updatedAt: new Date() },
      });
      return record;
    });
    return created;
  }

  async updateVersion(versionId: string, dto: CreateKnowledgeVersionDto, actor: KnowledgeActor) {
    const current = await this.prisma.knowledgeVersion.findUnique({
      where: { id: versionId },
      include: {
        knowledgeItem: {
          select: { id: true, createdBy: true, archivedAt: true },
        },
        supportingFiles: {
          select: { fileVersionId: true, role: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (
      !current ||
      current.archivedAt ||
      current.knowledgeItem.archivedAt ||
      !editableVersionStatuses.has(current.status) ||
      (!this.isManager(actor) && current.knowledgeItem.createdBy !== actor.sub)
    ) {
      throw new NotFoundException('可编辑知识版本不存在');
    }
    if (dto.revision === undefined || dto.revision !== current.revision) {
      throw new ConflictException('知识版本已被其他用户更新，请刷新后重试');
    }

    const contentType = (dto.contentType ?? current.contentType) as KnowledgeContentType;
    const sameType = contentType === current.contentType;
    const content = this.normalizeContent({
      contentType,
      fileVersionId:
        dto.fileVersionId === undefined
          ? sameType
            ? current.fileVersionId
            : null
          : dto.fileVersionId,
      markdownContent:
        dto.markdownContent === undefined
          ? sameType
            ? current.markdownContent
            : null
          : dto.markdownContent,
      externalUrl:
        dto.externalUrl === undefined ? (sameType ? current.externalUrl : null) : dto.externalUrl,
    });
    const supportingIds =
      dto.supportingFileVersionIds === undefined
        ? current.supportingFiles.map((file) => file.fileVersionId)
        : Array.from(new Set(dto.supportingFileVersionIds));
    this.assertSupportingFiles(content.fileVersionId, supportingIds);
    const allFileIds = [content.fileVersionId, ...supportingIds].filter((id): id is string =>
      Boolean(id),
    );
    await this.assertFileVersionsAccessible(allFileIds, actor);
    const nextVersion = dto.version?.trim() || current.version;
    if (nextVersion !== current.version) {
      await this.assertVersionAvailable(current.knowledgeItem.id, nextVersion);
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.knowledgeVersion.updateMany({
        where: {
          id: versionId,
          revision: dto.revision,
          status: { in: [...editableVersionStatuses] },
        },
        data: {
          revision: { increment: 1 },
          version: nextVersion,
          contentType: content.contentType,
          fileVersionId: content.fileVersionId,
          markdownContent: content.markdownContent,
          externalUrl: content.externalUrl,
          changeDescription:
            dto.changeDescription === undefined ? current.changeDescription : dto.changeDescription,
          submittedBy: actor.sub,
          status: 'DRAFT',
          submittedAt: null,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('知识版本已被其他用户更新，请刷新后重试');
      }
      if (dto.supportingFileVersionIds !== undefined) {
        await tx.knowledgeVersionFile.deleteMany({
          where: { knowledgeVersionId: versionId },
        });
        if (supportingIds.length > 0) {
          await tx.knowledgeVersionFile.createMany({
            data: supportingIds.map((fileVersionId, sortOrder) => ({
              knowledgeVersionId: versionId,
              fileVersionId,
              role: 'SUPPORTING',
              sortOrder,
            })),
          });
        }
      }
      await this.bindFileVersions(tx, allFileIds, current.knowledgeItem.id, actor.sub);
      await tx.knowledgeItem.update({
        where: { id: current.knowledgeItem.id },
        data: {
          contentType: content.contentType,
          updatedBy: actor.sub,
          updatedAt: new Date(),
        },
      });
      const updated = await tx.knowledgeVersion.findUnique({
        where: { id: versionId },
      });
      if (!updated) throw new NotFoundException('知识版本不存在');
      return updated;
    });
  }

  async submitReview(versionId: string, dto: SubmitKnowledgeReviewDto, actor: KnowledgeActor) {
    const version = await this.prisma.knowledgeVersion.findUnique({
      where: { id: versionId },
      include: {
        knowledgeItem: {
          select: {
            id: true,
            title: true,
            createdBy: true,
            archivedAt: true,
          },
        },
        supportingFiles: { select: { fileVersionId: true } },
      },
    });
    if (
      !version ||
      version.archivedAt ||
      version.knowledgeItem.archivedAt ||
      (!this.isManager(actor) && version.knowledgeItem.createdBy !== actor.sub)
    ) {
      throw new NotFoundException('知识版本不存在');
    }
    if (!editableVersionStatuses.has(version.status)) {
      throw new ConflictException('当前知识版本不能提交审核');
    }
    const content = this.normalizeContent({
      contentType: version.contentType as KnowledgeContentType,
      fileVersionId: version.fileVersionId,
      markdownContent: version.markdownContent,
      externalUrl: version.externalUrl,
    });
    this.assertSupportingFiles(
      content.fileVersionId,
      version.supportingFiles.map((file) => file.fileVersionId),
    );
    const approvalTemplateId = await this.resolveApprovalTemplateId(dto.approvalTemplateId);
    const configuration = await this.reviewConfiguration.resolve(approvalTemplateId, actor.sub);
    return this.reviewTasks.createTask({
      sourceType: 'KNOWLEDGE',
      sourceId: version.id,
      sourceVersionId: version.id,
      fileVersionId: version.fileVersionId ?? undefined,
      approvalTemplateId: configuration.approvalTemplateId,
      approvalTemplateVersion: configuration.approvalTemplateVersion,
      approvalSnapshot: configuration.snapshot,
      title: `${version.knowledgeItem.title} ${version.version}`,
      reviewMode: configuration.reviewMode,
      submittedBy: actor.sub,
      steps: configuration.steps,
    });
  }

  async archive(id: string, actor: KnowledgeActor) {
    if (!actor.permissions.includes('knowledge:archive')) {
      throw new ForbiddenException('无权归档知识条目');
    }
    const item = await this.prisma.knowledgeItem.findFirst({
      where: { id, archivedAt: null },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException('知识条目不存在');
    }
    const inReview = await this.prisma.knowledgeVersion.findFirst({
      where: { knowledgeItemId: id, status: 'IN_REVIEW', archivedAt: null },
      select: { id: true },
    });
    if (inReview) {
      throw new ConflictException('知识条目存在审核中版本，不能归档');
    }
    const archivedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeItem.update({
        where: { id },
        data: { status: 'ARCHIVED', archivedAt, updatedBy: actor.sub },
      });
      await tx.knowledgeVersion.updateMany({
        where: {
          knowledgeItemId: id,
          status: { in: ['DRAFT', 'REJECTED'] },
          archivedAt: null,
        },
        data: { status: 'ARCHIVED', archivedAt },
      });
      await tx.operationLog.create({
        data: {
          userId: actor.sub,
          module: 'knowledge',
          action: 'archive',
          targetType: 'knowledge_item',
          targetId: id,
        },
      });
    });
    return { id, status: 'ARCHIVED', archivedAt };
  }

  private async findEditableMaster(id: string, actor: KnowledgeActor, allowPublished = false) {
    const item = await this.prisma.knowledgeItem.findFirst({
      where: { id, archivedAt: null },
      select: {
        id: true,
        status: true,
        createdBy: true,
        currentPublishedVersionId: true,
      },
    });
    if (
      !item ||
      (!this.isManager(actor) && item.createdBy !== actor.sub) ||
      (!allowPublished && item.status === 'ARCHIVED')
    ) {
      throw new NotFoundException('知识条目不存在');
    }
    return item;
  }

  private async buildVisibilityWhere(
    actor: KnowledgeActor,
  ): Promise<Prisma.KnowledgeItemWhereInput> {
    if (this.isManager(actor)) return {};
    const assignedVersionIds = await this.findAssignedVersionIds(actor);
    return {
      OR: [
        { status: 'PUBLISHED' },
        { createdBy: actor.sub },
        ...(assignedVersionIds.length > 0
          ? [{ versions: { some: { id: { in: assignedVersionIds } } } }]
          : []),
      ],
    };
  }

  private async findAssignedVersionIds(actor: KnowledgeActor): Promise<string[]> {
    const tasks = await this.prisma.reviewTask.findMany({
      where: {
        sourceType: 'KNOWLEDGE',
        sourceVersionId: { not: null },
        steps: {
          some: { assignees: { some: { assigneeUserId: actor.sub } } },
        },
      },
      select: { sourceVersionId: true },
    });
    return tasks.flatMap((task) => (task.sourceVersionId ? [task.sourceVersionId] : []));
  }

  private async assertCategory(categoryId: string): Promise<void> {
    const category = await this.prisma.knowledgeCategory.findFirst({
      where: { id: categoryId, status: 'Active' },
      select: { id: true },
    });
    if (!category) {
      throw new UnprocessableEntityException('知识分类不存在或已停用');
    }
  }

  private normalizeContent(content: KnowledgeContent): KnowledgeContent {
    const normalized: KnowledgeContent = {
      contentType: content.contentType,
      fileVersionId: content.fileVersionId || null,
      markdownContent: content.markdownContent?.trim() || null,
      externalUrl: content.externalUrl?.trim() || null,
    };
    const populatedCount = [
      normalized.fileVersionId,
      normalized.markdownContent,
      normalized.externalUrl,
    ].filter(Boolean).length;
    const matchesType =
      (normalized.contentType === 'FILE' && Boolean(normalized.fileVersionId)) ||
      (normalized.contentType === 'MARKDOWN' && Boolean(normalized.markdownContent)) ||
      (normalized.contentType === 'LINK' && Boolean(normalized.externalUrl));
    if (populatedCount !== 1 || !matchesType) {
      throw new UnprocessableEntityException(
        'FILE、MARKDOWN、LINK 内容必须且只能填写对应的一种主内容',
      );
    }
    return normalized;
  }

  private assertSupportingFiles(
    primaryFileVersionId: string | null,
    supportingIds: string[],
  ): void {
    if (primaryFileVersionId && supportingIds.includes(primaryFileVersionId)) {
      throw new UnprocessableEntityException('主文件版本不能同时作为辅助文件版本');
    }
  }

  private async assertFileVersionsAccessible(ids: string[], actor: KnowledgeActor): Promise<void> {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return;
    const count = await this.prisma.fileVersion.count({
      where: {
        id: { in: uniqueIds },
        archivedAt: null,
        logicalFile: { archivedAt: null },
        ...(this.isManager(actor)
          ? {}
          : {
              OR: [
                { uploadedBy: actor.sub },
                { logicalFile: { createdBy: actor.sub, archivedAt: null } },
              ],
            }),
      },
    });
    if (count !== uniqueIds.length) {
      throw new UnprocessableEntityException('文件版本不存在、已归档或当前用户无权引用');
    }
  }

  private async bindFileVersions(
    tx: Prisma.TransactionClient,
    ids: string[],
    knowledgeItemId: string,
    actorUserId: string,
  ): Promise<void> {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return;
    const versions = await tx.fileVersion.findMany({
      where: { id: { in: uniqueIds }, archivedAt: null },
      select: {
        id: true,
        assetId: true,
        logicalFile: {
          select: { id: true, ownerType: true, ownerId: true, archivedAt: true },
        },
      },
    });
    if (versions.length !== uniqueIds.length) {
      throw new UnprocessableEntityException('知识条目引用的文件版本不存在或已归档');
    }
    for (const version of versions) {
      const owner = version.logicalFile;
      if (owner.archivedAt) {
        throw new UnprocessableEntityException('知识条目引用的业务文件已归档');
      }
      if (owner.ownerType === 'KNOWLEDGE' && owner.ownerId === knowledgeItemId) continue;
      if (owner.ownerType !== 'KNOWLEDGE_DRAFT' || owner.ownerId !== actorUserId) {
        throw new UnprocessableEntityException('文件不属于当前知识条目或当前用户草稿');
      }
      await tx.logicalFile.update({
        where: { id: owner.id },
        data: { ownerType: 'KNOWLEDGE', ownerId: knowledgeItemId },
      });
      await tx.fileAsset.update({
        where: { id: version.assetId },
        data: { ownerType: 'KNOWLEDGE', ownerId: knowledgeItemId },
      });
    }
  }

  private async assertVersionAvailable(itemId: string, version: string) {
    const duplicate = await this.prisma.knowledgeVersion.findUnique({
      where: { knowledgeItemId_version: { knowledgeItemId: itemId, version } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('知识版本号已存在');
    }
  }

  private async resolveApprovalTemplateId(
    requestedId: string | undefined,
  ): Promise<string | undefined> {
    if (requestedId) return requestedId;
    const template = await this.prisma.approvalTemplate.findFirst({
      where: { businessType: 'KNOWLEDGE', isEnabled: true },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    return template?.id;
  }

  private async nextVersion(itemId: string): Promise<string> {
    const versions = await this.prisma.knowledgeVersion.findMany({
      where: { knowledgeItemId: itemId },
      select: { version: true },
    });
    let major = 1;
    let minor = -1;
    for (const item of versions) {
      const match = /^V?(\d+)(?:\.(\d+))?$/i.exec(item.version.trim());
      if (!match) continue;
      const candidateMajor = Number(match[1]);
      const candidateMinor = Number(match[2] ?? 0);
      if (candidateMajor > major || (candidateMajor === major && candidateMinor > minor)) {
        major = candidateMajor;
        minor = candidateMinor;
      }
    }
    return minor < 0 ? 'V1.0' : `V${major}.${minor + 1}`;
  }

  private isManager(actor: KnowledgeActor): boolean {
    return actor.permissions.some((permission) => managerPermissions.has(permission));
  }
}
