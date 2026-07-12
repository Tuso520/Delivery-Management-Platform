import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ReviewConfigurationService } from '../review/review-configuration.service';
import { ReviewTaskService } from '../review/review-task.service';

import {
  CreateStandardDto,
  CreateStandardRelationDto,
  CreateStandardVersionDto,
  QueryStandardDto,
  SubmitStandardReviewDto,
  UpdateStandardDto,
} from './dto/standard.dto';

type StandardActor = Pick<JwtPayload, 'sub' | 'permissions'>;

const editableVersionStatuses = new Set(['DRAFT', 'REJECTED']);
const managerPermissions = new Set(['standard:publish', 'standard:archive']);

@Injectable()
export class StandardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewConfiguration: ReviewConfigurationService,
    private readonly reviewTasks: ReviewTaskService,
  ) {}

  async getSummary(actor: StandardActor) {
    const visibility = await this.buildVisibilityWhere(actor);
    const groups = await this.prisma.standard.groupBy({
      by: ['status'],
      where: visibility,
      _count: { _all: true },
    });
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
    };
  }

  async findAll(query: QueryStandardDto, actor: StandardActor) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const visibility = await this.buildVisibilityWhere(actor);
    const where: Prisma.StandardWhereInput = {
      AND: [
        visibility,
        {
          ...(query.status ? { status: query.status } : {}),
          archivedAt: query.status === 'ARCHIVED' ? { not: null } : null,
          ...(query.type ? { type: query.type } : {}),
          ...(query.category ? { category: query.category } : {}),
          ...(query.keyword
            ? {
                OR: [
                  { code: { contains: query.keyword } },
                  { name: { contains: query.keyword } },
                  {
                    versions: {
                      some: {
                        fileVersion: {
                          asset: { originalName: { contains: query.keyword } },
                        },
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
      this.prisma.standard.count({ where }),
      this.prisma.standard.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          category: true,
          status: true,
          effectiveAt: true,
          createdBy: true,
          updatedBy: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
          creator: { select: { id: true, realName: true } },
          updater: { select: { id: true, realName: true } },
          currentPublishedVersion: {
            select: {
              id: true,
              version: true,
              status: true,
              effectiveAt: true,
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

  async create(dto: CreateStandardDto, actor: StandardActor) {
    await this.assertCodeAvailable(dto.code);
    const fileVersionId = dto.fileVersionId ?? null;
    this.assertStandardContent(fileVersionId, dto.structuredContent ?? null);
    await this.assertFileVersionsAccessible(fileVersionId ? [fileVersionId] : [], actor);
    const standardId = await this.prisma.$transaction(async (tx) => {
      const standard = await tx.standard.create({
        data: {
          code: dto.code.trim(),
          name: dto.name.trim(),
          type: dto.type.trim(),
          category: dto.category?.trim(),
          status: 'DRAFT',
          effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : undefined,
          createdBy: actor.sub,
          updatedBy: actor.sub,
        },
        select: { id: true },
      });
      await tx.standardVersion.create({
        data: {
          standardId: standard.id,
          version: dto.version?.trim() || 'V1.0',
          fileVersionId,
          structuredContent: this.toNullableJson(dto.structuredContent),
          applicability: this.toNullableJson(dto.applicability),
          status: 'DRAFT',
          effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : undefined,
          changeDescription: dto.changeDescription,
          submittedBy: actor.sub,
        },
      });
      await this.bindFileVersions(tx, fileVersionId ? [fileVersionId] : [], standard.id, actor.sub);
      return standard.id;
    });
    return this.findById(standardId, actor);
  }

  async findById(id: string, actor: StandardActor) {
    const visibility = await this.buildVisibilityWhere(actor);
    const standard = await this.prisma.standard.findFirst({
      where: { AND: [{ id }, visibility] },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        category: true,
        status: true,
        currentPublishedVersionId: true,
        effectiveAt: true,
        createdBy: true,
        updatedBy: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
        creator: { select: { id: true, realName: true } },
        updater: { select: { id: true, realName: true } },
      },
    });
    if (!standard) {
      throw new NotFoundException('标准不存在');
    }
    const visibleVersionIds = await this.findAssignedVersionIds(actor);
    const canSeeDrafts = this.isManager(actor) || standard.createdBy === actor.sub;
    const versions = await this.prisma.standardVersion.findMany({
      where: {
        standardId: id,
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
        submitter: { select: { id: true, realName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { ...standard, versions };
  }

  async update(id: string, dto: UpdateStandardDto, actor: StandardActor) {
    const standard = await this.findEditableMaster(id, actor);
    if (dto.code && dto.code !== standard.code) {
      await this.assertCodeAvailable(dto.code, id);
    }
    await this.prisma.standard.update({
      where: { id },
      data: {
        updatedBy: actor.sub,
        ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category?.trim() || null } : {}),
        ...(dto.effectiveAt !== undefined
          ? {
              effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : null,
            }
          : {}),
      },
    });
    return this.findById(id, actor);
  }

  async createVersion(standardId: string, dto: CreateStandardVersionDto, actor: StandardActor) {
    const standard = await this.findEditableMaster(standardId, actor, true);
    const activeDraft = await this.prisma.standardVersion.findFirst({
      where: {
        standardId,
        archivedAt: null,
        status: { in: ['DRAFT', 'IN_REVIEW'] },
      },
      select: { id: true },
    });
    if (activeDraft) {
      throw new ConflictException('该标准已有草稿或审核中版本');
    }
    const source = standard.currentPublishedVersionId
      ? await this.prisma.standardVersion.findUnique({
          where: { id: standard.currentPublishedVersionId },
          select: {
            fileVersionId: true,
            structuredContent: true,
            applicability: true,
            effectiveAt: true,
          },
        })
      : null;
    const fileVersionId =
      dto.fileVersionId === undefined ? (source?.fileVersionId ?? null) : dto.fileVersionId;
    const structuredContent =
      dto.structuredContent === undefined
        ? (source?.structuredContent ?? null)
        : dto.structuredContent;
    this.assertStandardContent(fileVersionId, structuredContent);
    await this.assertFileVersionsAccessible(fileVersionId ? [fileVersionId] : [], actor);
    const version = dto.version?.trim() || (await this.nextVersion(standardId));
    await this.assertVersionAvailable(standardId, version);
    const created = await this.prisma.$transaction(async (tx) => {
      const record = await tx.standardVersion.create({
        data: {
          standardId,
          version,
          fileVersionId,
          structuredContent: this.toNullableJson(structuredContent),
          applicability: this.toNullableJson(
            dto.applicability === undefined ? source?.applicability : dto.applicability,
          ),
          status: 'DRAFT',
          effectiveAt:
            dto.effectiveAt === undefined
              ? source?.effectiveAt
              : dto.effectiveAt
                ? new Date(dto.effectiveAt)
                : null,
          changeDescription: dto.changeDescription,
          submittedBy: actor.sub,
        },
      });
      await this.bindFileVersions(tx, fileVersionId ? [fileVersionId] : [], standardId, actor.sub);
      await tx.standard.update({
        where: { id: standardId },
        data: { updatedBy: actor.sub, updatedAt: new Date() },
      });
      return record;
    });
    return created;
  }

  async updateVersion(versionId: string, dto: CreateStandardVersionDto, actor: StandardActor) {
    const current = await this.prisma.standardVersion.findUnique({
      where: { id: versionId },
      include: {
        standard: {
          select: { id: true, createdBy: true, archivedAt: true },
        },
      },
    });
    if (
      !current ||
      current.archivedAt ||
      current.standard.archivedAt ||
      !editableVersionStatuses.has(current.status) ||
      (!this.isManager(actor) && current.standard.createdBy !== actor.sub)
    ) {
      throw new NotFoundException('可编辑标准版本不存在');
    }
    if (dto.revision === undefined || dto.revision !== current.revision) {
      throw new ConflictException('标准版本已被其他用户更新，请刷新后重试');
    }

    const fileVersionId =
      dto.fileVersionId === undefined ? current.fileVersionId : dto.fileVersionId;
    const structuredContent =
      dto.structuredContent === undefined ? current.structuredContent : dto.structuredContent;
    this.assertStandardContent(fileVersionId, structuredContent);
    await this.assertFileVersionsAccessible(fileVersionId ? [fileVersionId] : [], actor);
    const nextVersion = dto.version?.trim() || current.version;
    if (nextVersion !== current.version) {
      await this.assertVersionAvailable(current.standard.id, nextVersion);
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.standardVersion.updateMany({
        where: {
          id: versionId,
          revision: dto.revision,
          status: { in: [...editableVersionStatuses] },
        },
        data: {
          revision: { increment: 1 },
          version: nextVersion,
          fileVersionId,
          structuredContent: this.toNullableJson(structuredContent),
          applicability:
            dto.applicability === undefined
              ? (current.applicability ?? Prisma.JsonNull)
              : this.toNullableJson(dto.applicability),
          effectiveAt:
            dto.effectiveAt === undefined
              ? current.effectiveAt
              : dto.effectiveAt
                ? new Date(dto.effectiveAt)
                : null,
          changeDescription:
            dto.changeDescription === undefined ? current.changeDescription : dto.changeDescription,
          submittedBy: actor.sub,
          status: 'DRAFT',
          submittedAt: null,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('标准版本已被其他用户更新，请刷新后重试');
      }
      await this.bindFileVersions(
        tx,
        fileVersionId ? [fileVersionId] : [],
        current.standard.id,
        actor.sub,
      );
      await tx.standard.update({
        where: { id: current.standard.id },
        data: { updatedBy: actor.sub, updatedAt: new Date() },
      });
      const updated = await tx.standardVersion.findUnique({
        where: { id: versionId },
      });
      if (!updated) throw new NotFoundException('标准版本不存在');
      return updated;
    });
  }

  async submitReview(versionId: string, dto: SubmitStandardReviewDto, actor: StandardActor) {
    const version = await this.prisma.standardVersion.findUnique({
      where: { id: versionId },
      include: {
        standard: {
          select: {
            id: true,
            code: true,
            name: true,
            createdBy: true,
            archivedAt: true,
          },
        },
      },
    });
    if (
      !version ||
      version.archivedAt ||
      version.standard.archivedAt ||
      (!this.isManager(actor) && version.standard.createdBy !== actor.sub)
    ) {
      throw new NotFoundException('标准版本不存在');
    }
    if (!editableVersionStatuses.has(version.status)) {
      throw new ConflictException('当前标准版本不能提交审核');
    }
    this.assertStandardContent(version.fileVersionId, version.structuredContent);
    const approvalTemplateId = await this.resolveApprovalTemplateId(
      dto.approvalTemplateId,
      'STANDARD',
    );
    const configuration = await this.reviewConfiguration.resolve(approvalTemplateId, actor.sub);
    return this.reviewTasks.createTask({
      sourceType: 'STANDARD',
      sourceId: version.id,
      sourceVersionId: version.id,
      fileVersionId: version.fileVersionId ?? undefined,
      approvalTemplateId: configuration.approvalTemplateId,
      approvalTemplateVersion: configuration.approvalTemplateVersion,
      approvalSnapshot: configuration.snapshot,
      title: `${version.standard.code} ${version.standard.name} ${version.version}`,
      reviewMode: configuration.reviewMode,
      submittedBy: actor.sub,
      steps: configuration.steps,
    });
  }

  async findRelations(standardId: string, actor: StandardActor) {
    await this.findVisibleMaster(standardId, actor);
    const relations = await this.prisma.standardRelation.findMany({
      where: { sourceStandardId: standardId },
      orderBy: { createdAt: 'asc' },
    });
    if (relations.length === 0) return [];
    const visibility = await this.buildVisibilityWhere(actor);
    const targets = await this.prisma.standard.findMany({
      where: {
        AND: [visibility, { id: { in: relations.map((relation) => relation.targetStandardId) } }],
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        status: true,
      },
    });
    const targetById = new Map(targets.map((target) => [target.id, target]));
    return relations.flatMap((relation) => {
      const target = targetById.get(relation.targetStandardId);
      return target ? [{ ...relation, targetStandard: target }] : [];
    });
  }

  async createRelation(standardId: string, dto: CreateStandardRelationDto, actor: StandardActor) {
    await this.findEditableMaster(standardId, actor, true);
    if (standardId === dto.targetStandardId) {
      throw new UnprocessableEntityException('标准不能关联自身');
    }
    const visibility = await this.buildVisibilityWhere(actor);
    const target = await this.prisma.standard.findFirst({
      where: {
        AND: [{ id: dto.targetStandardId, archivedAt: null }, visibility],
      },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException('目标标准不存在');
    }
    const duplicate = await this.prisma.standardRelation.findUnique({
      where: {
        sourceStandardId_targetStandardId_relationType: {
          sourceStandardId: standardId,
          targetStandardId: dto.targetStandardId,
          relationType: dto.relationType,
        },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('标准关系已存在');
    }
    return this.prisma.standardRelation.create({
      data: {
        sourceStandardId: standardId,
        targetStandardId: dto.targetStandardId,
        relationType: dto.relationType,
        createdBy: actor.sub,
      },
    });
  }

  async deleteRelation(
    standardId: string,
    relationId: string,
    actor: StandardActor,
  ): Promise<void> {
    await this.findEditableMaster(standardId, actor, true);
    const relation = await this.prisma.standardRelation.findFirst({
      where: { id: relationId, sourceStandardId: standardId },
      select: { id: true },
    });
    if (!relation) {
      throw new NotFoundException('标准关系不存在');
    }
    await this.prisma.standardRelation.delete({ where: { id: relation.id } });
  }

  async archive(id: string, actor: StandardActor) {
    if (!actor.permissions.includes('standard:archive')) {
      throw new ForbiddenException('无权归档标准');
    }
    const standard = await this.prisma.standard.findFirst({
      where: { id, archivedAt: null },
      select: { id: true },
    });
    if (!standard) {
      throw new NotFoundException('标准不存在');
    }
    const inReview = await this.prisma.standardVersion.findFirst({
      where: { standardId: id, status: 'IN_REVIEW', archivedAt: null },
      select: { id: true },
    });
    if (inReview) {
      throw new ConflictException('标准存在审核中版本，不能归档');
    }
    const archivedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.standard.update({
        where: { id },
        data: { status: 'ARCHIVED', archivedAt, updatedBy: actor.sub },
      });
      await tx.standardVersion.updateMany({
        where: {
          standardId: id,
          status: { in: ['DRAFT', 'REJECTED'] },
          archivedAt: null,
        },
        data: { status: 'ARCHIVED', archivedAt },
      });
      await tx.operationLog.create({
        data: {
          userId: actor.sub,
          module: 'standard',
          action: 'archive',
          targetType: 'standard',
          targetId: id,
        },
      });
    });
    return { id, status: 'ARCHIVED', archivedAt };
  }

  private async findVisibleMaster(id: string, actor: StandardActor) {
    const visibility = await this.buildVisibilityWhere(actor);
    const standard = await this.prisma.standard.findFirst({
      where: { AND: [{ id }, visibility] },
      select: {
        id: true,
        code: true,
        name: true,
        createdBy: true,
        archivedAt: true,
        currentPublishedVersionId: true,
      },
    });
    if (!standard) {
      throw new NotFoundException('标准不存在');
    }
    return standard;
  }

  private async findEditableMaster(id: string, actor: StandardActor, allowPublished = false) {
    const standard = await this.prisma.standard.findFirst({
      where: { id, archivedAt: null },
      select: {
        id: true,
        code: true,
        status: true,
        createdBy: true,
        currentPublishedVersionId: true,
      },
    });
    if (
      !standard ||
      (!this.isManager(actor) && standard.createdBy !== actor.sub) ||
      (!allowPublished && standard.status === 'ARCHIVED')
    ) {
      throw new NotFoundException('标准不存在');
    }
    return standard;
  }

  private async buildVisibilityWhere(actor: StandardActor): Promise<Prisma.StandardWhereInput> {
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

  private async findAssignedVersionIds(actor: StandardActor): Promise<string[]> {
    const tasks = await this.prisma.reviewTask.findMany({
      where: {
        sourceType: 'STANDARD',
        sourceVersionId: { not: null },
        steps: {
          some: { assignees: { some: { assigneeUserId: actor.sub } } },
        },
      },
      select: { sourceVersionId: true },
    });
    return tasks.flatMap((task) => (task.sourceVersionId ? [task.sourceVersionId] : []));
  }

  private async assertCodeAvailable(code: string, excludeId?: string) {
    const duplicate = await this.prisma.standard.findFirst({
      where: {
        code: code.trim(),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('标准编码已存在');
    }
  }

  private async assertVersionAvailable(standardId: string, version: string) {
    const duplicate = await this.prisma.standardVersion.findUnique({
      where: { standardId_version: { standardId, version } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('标准版本号已存在');
    }
  }

  private async assertFileVersionsAccessible(ids: string[], actor: StandardActor): Promise<void> {
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
    standardId: string,
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
      throw new UnprocessableEntityException('标准引用的文件版本不存在或已归档');
    }
    for (const version of versions) {
      const owner = version.logicalFile;
      if (owner.archivedAt) {
        throw new UnprocessableEntityException('标准引用的业务文件已归档');
      }
      if (owner.ownerType === 'STANDARD' && owner.ownerId === standardId) continue;
      if (owner.ownerType !== 'STANDARD_DRAFT' || owner.ownerId !== actorUserId) {
        throw new UnprocessableEntityException('文件不属于当前标准或当前用户草稿');
      }
      await tx.logicalFile.update({
        where: { id: owner.id },
        data: { ownerType: 'STANDARD', ownerId: standardId },
      });
      await tx.fileAsset.update({
        where: { id: version.assetId },
        data: { ownerType: 'STANDARD', ownerId: standardId },
      });
    }
  }

  private assertStandardContent(
    fileVersionId: string | null,
    structuredContent: Prisma.JsonValue | Prisma.InputJsonValue | null,
  ): void {
    if (!fileVersionId && structuredContent === null) {
      throw new UnprocessableEntityException('标准版本必须包含文件版本或结构化内容');
    }
  }

  private async resolveApprovalTemplateId(
    requestedId: string | undefined,
    businessType: string,
  ): Promise<string | undefined> {
    if (requestedId) return requestedId;
    const template = await this.prisma.approvalTemplate.findFirst({
      where: { businessType, isEnabled: true },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    return template?.id;
  }

  private async nextVersion(standardId: string): Promise<string> {
    const versions = await this.prisma.standardVersion.findMany({
      where: { standardId },
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

  private toNullableJson(
    value: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
  ): Prisma.InputJsonValue | Prisma.NullTypes.DbNull | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.DbNull;
    return value as Prisma.InputJsonValue;
  }

  private isManager(actor: StandardActor): boolean {
    return actor.permissions.some((permission) => managerPermissions.has(permission));
  }
}
