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
import { FieldConfigurationService } from '../field-configuration/field-configuration.service';
import { writeOperationLog } from '../operation-log/operation-log.service';
import { ReviewConfigurationService } from '../review/review-configuration.service';
import { ReviewTaskService } from '../review/review-task.service';

import {
  CreateStandardDto,
  CreateStandardRelationDto,
  CreateStandardVersionDto,
  QueryStandardCategoryCountsDto,
  QueryStandardDto,
  SubmitStandardReviewDto,
  UpdateStandardDto,
} from './dto/standard.dto';

type StandardActor = Pick<JwtPayload, 'sub' | 'permissions'>;

const editableVersionStatuses = new Set(['DRAFT', 'REJECTED']);
const managerPermissions = new Set(['standard:publish', 'standard:archive']);

const publicStandardFileAssetSelect = {
  id: true,
  originalName: true,
  extension: true,
  mimeType: true,
  size: true,
} satisfies Prisma.FileAssetSelect;

const publicStandardFileVersionSelect = {
  id: true,
  logicalFileId: true,
  version: true,
  status: true,
  asset: { select: publicStandardFileAssetSelect },
} satisfies Prisma.FileVersionSelect;

const publicStandardVersionSelect = {
  id: true,
  standardId: true,
  version: true,
  fileVersionId: true,
  status: true,
  revision: true,
  effectiveAt: true,
  changeDescription: true,
  submittedBy: true,
  publishedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  fileVersion: { select: publicStandardFileVersionSelect },
  submitter: { select: { id: true, realName: true } },
} satisfies Prisma.StandardVersionSelect;

const publicStandardSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  deliveryStageCode: true,
  managementDomainCode: true,
  businessTypeCode: true,
  isEnabled: true,
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
  applicableCountries: {
    select: { countryCode: true },
    orderBy: { countryCode: 'asc' },
  },
  currentPublishedVersion: {
    select: {
      id: true,
      version: true,
      status: true,
      effectiveAt: true,
      publishedAt: true,
    },
  },
} satisfies Prisma.StandardSelect;

const publicStandardRelationSelect = {
  id: true,
  sourceStandardId: true,
  targetStandardId: true,
  relationType: true,
  createdBy: true,
  createdAt: true,
} satisfies Prisma.StandardRelationSelect;

const publicStandardRelationTargetSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  status: true,
} satisfies Prisma.StandardSelect;

type PublicStandardRecord = Prisma.StandardGetPayload<{ select: typeof publicStandardSelect }>;
type PublicStandardVersionRecord = Prisma.StandardVersionGetPayload<{
  select: typeof publicStandardVersionSelect;
}>;
type PublicStandardRelationRecord = Prisma.StandardRelationGetPayload<{
  select: typeof publicStandardRelationSelect;
}>;
type PublicStandardRelationTargetRecord = Prisma.StandardGetPayload<{
  select: typeof publicStandardRelationTargetSelect;
}>;

function mapPublicStandardVersion(record: PublicStandardVersionRecord) {
  if (!record.fileVersionId || !record.fileVersion) {
    throw new UnprocessableEntityException('标准版本文件关联缺失');
  }
  return {
    id: record.id,
    standardId: record.standardId,
    version: record.version,
    fileVersionId: record.fileVersionId,
    fileVersion: {
      id: record.fileVersion.id,
      logicalFileId: record.fileVersion.logicalFileId,
      version: record.fileVersion.version,
      status: record.fileVersion.status,
      asset: {
        id: record.fileVersion.asset.id,
        originalName: record.fileVersion.asset.originalName,
        extension: record.fileVersion.asset.extension,
        mimeType: record.fileVersion.asset.mimeType,
        size: record.fileVersion.asset.size,
      },
    },
    status: record.status,
    revision: record.revision,
    effectiveAt: record.effectiveAt,
    changeDescription: record.changeDescription,
    submittedBy: record.submittedBy,
    submitter: record.submitter
      ? { id: record.submitter.id, realName: record.submitter.realName }
      : null,
    publishedAt: record.publishedAt,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapPublicStandard(record: PublicStandardRecord, versions?: PublicStandardVersionRecord[]) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    type: record.type,
    deliveryStageCode: record.deliveryStageCode,
    managementDomainCode: record.managementDomainCode,
    businessTypeCode: record.businessTypeCode,
    countryCodes: record.applicableCountries.map((item) => item.countryCode),
    isEnabled: record.isEnabled,
    status: record.status,
    currentPublishedVersionId: record.currentPublishedVersionId,
    currentPublishedVersion: record.currentPublishedVersion
      ? {
          id: record.currentPublishedVersion.id,
          version: record.currentPublishedVersion.version,
          status: record.currentPublishedVersion.status,
          effectiveAt: record.currentPublishedVersion.effectiveAt,
          publishedAt: record.currentPublishedVersion.publishedAt,
        }
      : null,
    effectiveAt: record.effectiveAt,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
    creator: record.creator ? { id: record.creator.id, realName: record.creator.realName } : null,
    updater: record.updater ? { id: record.updater.id, realName: record.updater.realName } : null,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(versions === undefined ? {} : { versions: versions.map(mapPublicStandardVersion) }),
  };
}

function mapPublicStandardRelation(
  relation: PublicStandardRelationRecord,
  targetStandard: PublicStandardRelationTargetRecord,
) {
  return {
    id: relation.id,
    sourceStandardId: relation.sourceStandardId,
    targetStandardId: relation.targetStandardId,
    relationType: relation.relationType,
    createdBy: relation.createdBy,
    createdAt: relation.createdAt,
    targetStandard: {
      id: targetStandard.id,
      code: targetStandard.code,
      name: targetStandard.name,
      type: targetStandard.type,
      status: targetStandard.status,
    },
  };
}

@Injectable()
export class StandardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewConfiguration: ReviewConfigurationService,
    private readonly reviewTasks: ReviewTaskService,
    @Optional() private readonly fieldConfiguration?: FieldConfigurationService,
  ) {}

  async getSummary(actor: StandardActor) {
    const visibility = await this.buildVisibilityWhere(actor);
    const [groups, visibleStandards] = await Promise.all([
      this.prisma.standard.groupBy({
        by: ['status'],
        where: visibility,
        _count: { _all: true },
      }),
      this.prisma.standard.findMany({
        where: visibility,
        select: { id: true },
      }),
    ]);
    const counts = new Map(groups.map((group) => [group.status, group._count._all]));
    const draft = counts.get('DRAFT') ?? 0;
    const inReview = counts.get('IN_REVIEW') ?? 0;
    const rejected = counts.get('REJECTED') ?? 0;
    const published = counts.get('PUBLISHED') ?? 0;
    const archived = counts.get('ARCHIVED') ?? 0;
    const standardIds = visibleStandards.map((standard) => standard.id);
    const logicalFiles = standardIds.length
      ? await this.prisma.logicalFile.findMany({
          where: { ownerType: 'STANDARD', ownerId: { in: standardIds }, archivedAt: null },
          select: { id: true },
        })
      : [];
    const logicalFileIds = logicalFiles.map((file) => file.id);
    const [viewCount, downloadCount] = await Promise.all([
      standardIds.length
        ? this.prisma.operationLog.count({
            where: {
              module: 'standard',
              action: 'view',
              targetType: 'standard',
              targetId: { in: standardIds },
              result: 'success',
            },
          })
        : 0,
      logicalFileIds.length
        ? this.prisma.operationLog.count({
            where: {
              module: 'file',
              action: 'download',
              targetType: 'logical_file',
              targetId: { in: logicalFileIds },
              result: 'success',
            },
          })
        : 0,
    ]);
    return {
      total: draft + inReview + rejected + published + archived,
      viewCount,
      downloadCount,
      draft,
      inReview,
      rejected,
      published,
      archived,
    };
  }

  async getCategoryCounts(query: QueryStandardCategoryCountsDto, actor: StandardActor) {
    const visibility = await this.buildVisibilityWhere(actor);
    const where: Prisma.StandardWhereInput = {
      AND: [
        visibility,
        {
          archivedAt: null,
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
    if (query.dimension === 'DELIVERY_STAGE') {
      const groups = await this.prisma.standard.groupBy({
        by: ['deliveryStageCode'],
        where: { ...where, deliveryStageCode: { not: null } },
        _count: { _all: true },
      });
      return groups.flatMap((group) =>
        group.deliveryStageCode
          ? [{ code: group.deliveryStageCode, count: group._count._all }]
          : [],
      );
    }
    const groups = await this.prisma.standard.groupBy({
      by: ['managementDomainCode'],
      where: { ...where, managementDomainCode: { not: null } },
      _count: { _all: true },
    });
    return groups.flatMap((group) =>
      group.managementDomainCode
        ? [{ code: group.managementDomainCode, count: group._count._all }]
        : [],
    );
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
          ...(query.deliveryStageCode ? { deliveryStageCode: query.deliveryStageCode } : {}),
          ...(query.managementDomainCode
            ? { managementDomainCode: query.managementDomainCode }
            : {}),
          ...(query.businessTypeCode ? { businessTypeCode: query.businessTypeCode } : {}),
          ...(query.countryCode
            ? { applicableCountries: { some: { countryCode: query.countryCode } } }
            : {}),
          ...(query.isEnabled === undefined ? {} : { isEnabled: query.isEnabled }),
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
        select: publicStandardSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: this.standardOrderBy(query),
      }),
    ]);
    return {
      items: list.map((standard) => mapPublicStandard(standard)),
      page,
      pageSize,
      total,
    };
  }

  async create(dto: CreateStandardDto, actor: StandardActor) {
    await this.assertCodeAvailable(dto.code);
    const countryCodes = this.normalizeCountryCodes(dto.countryCodes);
    await this.assertConfiguredFields({
      type: dto.type,
      deliveryStageCode: dto.deliveryStageCode,
      managementDomainCode: dto.managementDomainCode,
      businessTypeCode: dto.businessTypeCode,
      countryCodes,
    });
    await this.assertCountryCodesExist(countryCodes);
    const fileVersionId = this.requireFileVersionId(dto.fileVersionId);
    await this.assertFileVersionsAccessible([fileVersionId], actor);
    const standardId = await this.prisma.$transaction(async (tx) => {
      const standard = await tx.standard.create({
        data: {
          code: dto.code.trim(),
          name: dto.name.trim(),
          type: dto.type.trim(),
          deliveryStageCode: dto.deliveryStageCode.trim(),
          managementDomainCode: dto.managementDomainCode?.trim() || null,
          businessTypeCode: dto.businessTypeCode?.trim() || null,
          isEnabled: dto.isEnabled ?? true,
          status: 'DRAFT',
          effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : undefined,
          createdBy: actor.sub,
          updatedBy: actor.sub,
          applicableCountries: {
            create: countryCodes.map((countryCode) => ({ countryCode })),
          },
        },
        select: { id: true },
      });
      await tx.standardVersion.create({
        data: {
          standardId: standard.id,
          version: dto.version?.trim() || 'V1.0',
          fileVersionId,
          status: 'DRAFT',
          effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : undefined,
          changeDescription: dto.changeDescription,
          submittedBy: actor.sub,
        },
      });
      await this.bindFileVersions(tx, [fileVersionId], standard.id, actor.sub);
      await writeOperationLog(tx, {
        userId: actor.sub,
        module: 'standard',
        action: 'create',
        targetType: 'standard',
        targetId: standard.id,
        afterData: {
          code: dto.code.trim(),
          deliveryStageCode: dto.deliveryStageCode.trim(),
        },
      });
      return standard.id;
    });
    return this.findById(standardId, actor);
  }

  async findById(id: string, actor: StandardActor, recordView = false) {
    const visibility = await this.buildVisibilityWhere(actor);
    const standard = await this.prisma.standard.findFirst({
      where: { AND: [{ id }, visibility] },
      select: publicStandardSelect,
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
      select: publicStandardVersionSelect,
      orderBy: { createdAt: 'desc' },
    });
    if (recordView) {
      await writeOperationLog(this.prisma, {
        userId: actor.sub,
        module: 'standard',
        action: 'view',
        targetType: 'standard',
        targetId: id,
      });
    }
    return mapPublicStandard(standard, versions);
  }

  async update(id: string, dto: UpdateStandardDto, actor: StandardActor) {
    const standard = await this.findEditableMaster(id, actor);
    const countryCodes =
      dto.countryCodes === undefined
        ? undefined
        : this.normalizeCountryCodes(dto.countryCodes);
    await this.assertConfiguredFields(
      {
        type: dto.type,
        deliveryStageCode: dto.deliveryStageCode,
        managementDomainCode: dto.managementDomainCode,
        businessTypeCode: dto.businessTypeCode,
        countryCodes,
      },
      {
        type: standard.type,
        deliveryStageCode: standard.deliveryStageCode,
        managementDomainCode: standard.managementDomainCode,
        businessTypeCode: standard.businessTypeCode,
        countryCodes: standard.applicableCountries.map((item) => item.countryCode),
      },
    );
    if (countryCodes) await this.assertCountryCodesExist(countryCodes);
    if (dto.code && dto.code !== standard.code) {
      await this.assertCodeAvailable(dto.code, id);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.standard.update({
        where: { id },
        data: {
          updatedBy: actor.sub,
          ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.type !== undefined ? { type: dto.type.trim() } : {}),
          ...(dto.deliveryStageCode !== undefined
            ? { deliveryStageCode: dto.deliveryStageCode.trim() }
            : {}),
          ...(dto.managementDomainCode !== undefined
            ? { managementDomainCode: dto.managementDomainCode?.trim() || null }
            : {}),
          ...(dto.businessTypeCode !== undefined
            ? { businessTypeCode: dto.businessTypeCode?.trim() || null }
            : {}),
          ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
          ...(dto.effectiveAt !== undefined
            ? {
                effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : null,
              }
            : {}),
        },
      });
      if (countryCodes) {
        await tx.standardCountry.deleteMany({ where: { standardId: id } });
        if (countryCodes.length) {
          await tx.standardCountry.createMany({
            data: countryCodes.map((countryCode) => ({ standardId: id, countryCode })),
          });
        }
      }
      await writeOperationLog(tx, {
        userId: actor.sub,
        module: 'standard',
        action: 'update',
        targetType: 'standard',
        targetId: id,
      });
    });
    return this.findById(id, actor);
  }

  async changeEnabled(id: string, enabled: boolean, actor: StandardActor) {
    const standard = await this.findEditableMaster(id, actor, true);
    if (standard.isEnabled === enabled) return this.findById(id, actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.standard.update({
        where: { id },
        data: { isEnabled: enabled, updatedBy: actor.sub },
      });
      await writeOperationLog(tx, {
        userId: actor.sub,
        module: 'standard',
        action: enabled ? 'enable' : 'disable',
        targetType: 'standard',
        targetId: id,
        beforeData: { enabled: standard.isEnabled },
        afterData: { enabled },
      });
    });
    return this.findById(id, actor);
  }

  async createVersion(standardId: string, dto: CreateStandardVersionDto, actor: StandardActor) {
    await this.findEditableMaster(standardId, actor, true);
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockActiveStandard(tx, standardId);
      const activeDraft = await tx.standardVersion.findFirst({
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
      const lockedStandard = await tx.standard.findUnique({
        where: { id: standardId },
        select: { currentPublishedVersionId: true },
      });
      const source = lockedStandard?.currentPublishedVersionId
        ? await tx.standardVersion.findUnique({
            where: { id: lockedStandard.currentPublishedVersionId },
            select: {
              fileVersionId: true,
              effectiveAt: true,
            },
          })
        : null;
      const fileVersionId = this.requireFileVersionId(dto.fileVersionId ?? source?.fileVersionId);
      await this.assertFileVersionsAccessible([fileVersionId], actor, standardId, tx);
      const version = dto.version?.trim() || (await this.nextVersion(standardId, tx));
      await this.assertVersionAvailable(standardId, version, tx);
      const record = await tx.standardVersion.create({
        data: {
          standardId,
          version,
          fileVersionId,
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
        select: publicStandardVersionSelect,
      });
      await this.bindFileVersions(tx, [fileVersionId], standardId, actor.sub);
      await tx.standard.update({
        where: { id: standardId },
        data: { updatedBy: actor.sub, updatedAt: new Date() },
      });
      return record;
    });
    return mapPublicStandardVersion(created);
  }

  async updateVersion(versionId: string, dto: CreateStandardVersionDto, actor: StandardActor) {
    const current = await this.prisma.standardVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        version: true,
        fileVersionId: true,
        status: true,
        revision: true,
        effectiveAt: true,
        changeDescription: true,
        archivedAt: true,
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

    const fileVersionId = this.requireFileVersionId(dto.fileVersionId ?? current.fileVersionId);
    await this.assertFileVersionsAccessible([fileVersionId], actor, current.standard.id);
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
      await this.bindFileVersions(tx, [fileVersionId], current.standard.id, actor.sub);
      await tx.standard.update({
        where: { id: current.standard.id },
        data: { updatedBy: actor.sub, updatedAt: new Date() },
      });
      const updated = await tx.standardVersion.findUnique({
        where: { id: versionId },
        select: publicStandardVersionSelect,
      });
      if (!updated) throw new NotFoundException('标准版本不存在');
      return mapPublicStandardVersion(updated);
    });
  }

  async submitReview(versionId: string, dto: SubmitStandardReviewDto, actor: StandardActor) {
    const version = await this.prisma.standardVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        version: true,
        status: true,
        revision: true,
        fileVersionId: true,
        archivedAt: true,
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
    if (dto.revision !== version.revision) {
      throw new ConflictException('标准版本已被其他用户更新，请刷新后重试');
    }
    const fileVersionId = this.requireFileVersionId(version.fileVersionId);
    const approvalTemplateId = await this.resolveApprovalTemplateId(
      dto.approvalTemplateId,
      'STANDARD',
    );
    const configuration = await this.reviewConfiguration.resolve(approvalTemplateId, actor.sub);
    const task = await this.reviewTasks.createTask({
      sourceType: 'STANDARD',
      sourceId: version.id,
      sourceVersionId: version.id,
      sourceRevision: dto.revision,
      fileVersionId,
      approvalTemplateId: configuration.approvalTemplateId,
      approvalTemplateVersion: configuration.approvalTemplateVersion,
      approvalSnapshot: configuration.snapshot,
      title: `${version.standard.code} ${version.standard.name} ${version.version}`,
      reviewMode: configuration.reviewMode,
      submittedBy: actor.sub,
      steps: configuration.steps,
    });
    return { id: task.id, status: task.status };
  }

  async findRelations(standardId: string, actor: StandardActor) {
    await this.findVisibleMaster(standardId, actor);
    const relations = await this.prisma.standardRelation.findMany({
      where: { sourceStandardId: standardId },
      select: publicStandardRelationSelect,
      orderBy: { createdAt: 'asc' },
    });
    if (relations.length === 0) return [];
    const visibility = await this.buildVisibilityWhere(actor);
    const targets = await this.prisma.standard.findMany({
      where: {
        AND: [visibility, { id: { in: relations.map((relation) => relation.targetStandardId) } }],
      },
      select: publicStandardRelationTargetSelect,
    });
    const targetById = new Map(targets.map((target) => [target.id, target]));
    return relations.flatMap((relation) => {
      const target = targetById.get(relation.targetStandardId);
      return target ? [mapPublicStandardRelation(relation, target)] : [];
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
      select: publicStandardRelationTargetSelect,
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
    const relation = await this.prisma.standardRelation.create({
      data: {
        sourceStandardId: standardId,
        targetStandardId: dto.targetStandardId,
        relationType: dto.relationType,
        createdBy: actor.sub,
      },
      select: publicStandardRelationSelect,
    });
    return mapPublicStandardRelation(relation, target);
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
    const archivedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.lockActiveStandard(tx, id);
      const inReview = await tx.standardVersion.findFirst({
        where: { standardId: id, status: 'IN_REVIEW', archivedAt: null },
        select: { id: true },
      });
      const versionIds = await tx.standardVersion.findMany({
        where: { standardId: id },
        select: { id: true },
      });
      const activeTask = await tx.reviewTask.findFirst({
        where: {
          sourceType: 'STANDARD',
          status: 'PENDING',
          archivedAt: null,
          sourceVersionId: { in: versionIds.map((version) => version.id) },
        },
        select: { id: true },
      });
      if (inReview || activeTask) {
        throw new ConflictException('标准存在审核中版本，不能归档');
      }
      const claimed = await tx.standard.updateMany({
        where: { id, archivedAt: null },
        data: { status: 'ARCHIVED', archivedAt, isEnabled: false, updatedBy: actor.sub },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('标准状态已变化，请刷新后重试');
      }
      await tx.standardVersion.updateMany({
        where: {
          standardId: id,
          status: { in: ['DRAFT', 'REJECTED'] },
          archivedAt: null,
        },
        data: { status: 'ARCHIVED', archivedAt },
      });
      await writeOperationLog(tx, {
          userId: actor.sub,
          module: 'standard',
          action: 'archive',
          targetType: 'standard',
          targetId: id,
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
        type: true,
        status: true,
        deliveryStageCode: true,
        managementDomainCode: true,
        businessTypeCode: true,
        isEnabled: true,
        createdBy: true,
        currentPublishedVersionId: true,
        applicableCountries: { select: { countryCode: true } },
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

  private async assertVersionAvailable(
    standardId: string,
    version: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const duplicate = await client.standardVersion.findUnique({
      where: { standardId_version: { standardId, version } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('标准版本号已存在');
    }
  }

  private async assertFileVersionsAccessible(
    ids: string[],
    actor: StandardActor,
    standardId?: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return;
    const count = await client.fileVersion.count({
      where: {
        id: { in: uniqueIds },
        archivedAt: null,
        logicalFile: { archivedAt: null },
        asset: {
          archivedAt: null,
          status: 'AVAILABLE',
          storageProvider: 'minio',
          checksum: { not: null },
        },
        ...(this.isManager(actor)
          ? {}
          : {
              OR: [
                { uploadedBy: actor.sub },
                { logicalFile: { createdBy: actor.sub, archivedAt: null } },
                ...(standardId
                  ? [
                      {
                        logicalFile: {
                          ownerType: 'STANDARD',
                          ownerId: standardId,
                          archivedAt: null,
                        },
                      },
                    ]
                  : []),
              ],
            }),
      },
    });
    if (count !== uniqueIds.length) {
      throw new UnprocessableEntityException('文件版本不存在、不可用、已归档或当前用户无权引用');
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
      where: {
        id: { in: uniqueIds },
        archivedAt: null,
        logicalFile: { archivedAt: null },
        asset: {
          archivedAt: null,
          status: 'AVAILABLE',
          storageProvider: 'minio',
          checksum: { not: null },
        },
      },
      select: {
        id: true,
        assetId: true,
        logicalFile: {
          select: { id: true, ownerType: true, ownerId: true, archivedAt: true },
        },
      },
    });
    if (versions.length !== uniqueIds.length) {
      throw new UnprocessableEntityException('标准引用的文件版本不存在、不可用或已归档');
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

  private requireFileVersionId(fileVersionId: string | null | undefined): string {
    if (!fileVersionId) {
      throw new UnprocessableEntityException('标准版本必须关联有效文件版本');
    }
    return fileVersionId;
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

  private async nextVersion(
    standardId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string> {
    const versions = await client.standardVersion.findMany({
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

  private standardOrderBy(query: QueryStandardDto): Prisma.StandardOrderByWithRelationInput {
    const direction = query.sortOrder ?? 'desc';
    switch (query.sortBy) {
      case 'name':
        return { name: direction };
      case 'effectiveAt':
        return { effectiveAt: direction };
      case 'currentVersion':
        return { currentPublishedVersion: { version: direction } };
      default:
        return { updatedAt: direction };
    }
  }

  private normalizeCountryCodes(countryCodes?: string[]): string[] {
    return Array.from(
      new Set(
        (countryCodes ?? [])
          .map((countryCode) => countryCode.trim().toUpperCase())
          .filter(Boolean),
      ),
    );
  }

  private async assertCountryCodesExist(countryCodes: string[]): Promise<void> {
    if (!countryCodes.length) return;
    const count = await this.prisma.country.count({
      where: { countryCode: { in: countryCodes } },
    });
    if (count !== countryCodes.length) {
      throw new UnprocessableEntityException('适用国家包含不存在的国家编码');
    }
  }

  private async assertConfiguredFields(
    next: {
      type?: string;
      deliveryStageCode?: string;
      managementDomainCode?: string | null;
      businessTypeCode?: string | null;
      countryCodes?: string[];
    },
    current: {
      type?: string;
      deliveryStageCode?: string | null;
      managementDomainCode?: string | null;
      businessTypeCode?: string | null;
      countryCodes?: string[];
    } = {},
  ): Promise<void> {
    if (!this.fieldConfiguration) return;
    const validations: Array<Promise<void>> = [];
    if (next.type !== undefined) {
      validations.push(
        this.fieldConfiguration.assertConfiguredValue('STANDARD_TYPE', next.type, current.type),
      );
    }
    if (next.deliveryStageCode !== undefined) {
      validations.push(
        this.fieldConfiguration.assertConfiguredValue(
          'STANDARD_DELIVERY_STAGE',
          next.deliveryStageCode,
          current.deliveryStageCode,
        ),
      );
    }
    if (next.managementDomainCode !== undefined) {
      validations.push(
        this.fieldConfiguration.assertConfiguredValue(
          'STANDARD_MANAGEMENT_DOMAIN',
          next.managementDomainCode,
          current.managementDomainCode,
        ),
      );
    }
    if (next.businessTypeCode !== undefined) {
      validations.push(
        this.fieldConfiguration.assertConfiguredValue(
          'STANDARD_BUSINESS_TYPE',
          next.businessTypeCode,
          current.businessTypeCode,
        ),
      );
    }
    const currentCountryCodes = new Set(current.countryCodes ?? []);
    for (const countryCode of next.countryCodes ?? []) {
      validations.push(
        this.fieldConfiguration.assertConfiguredValue(
          'COUNTRY',
          countryCode,
          currentCountryCodes.has(countryCode) ? countryCode : undefined,
        ),
      );
    }
    await Promise.all(validations);
  }

  private async lockActiveStandard(
    tx: Prisma.TransactionClient,
    standardId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string; archived_at: Date | null }>>(Prisma.sql`
      SELECT id, archived_at
      FROM standards
      WHERE id = ${standardId}
      FOR UPDATE
    `);
    if (rows.length !== 1 || rows[0].archived_at) {
      throw new NotFoundException('标准不存在');
    }
  }

  private isManager(actor: StandardActor): boolean {
    return actor.permissions.some((permission) => managerPermissions.has(permission));
  }
}
