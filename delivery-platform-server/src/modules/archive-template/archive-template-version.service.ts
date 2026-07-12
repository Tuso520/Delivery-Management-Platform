import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { OperationLogService } from '../operation-log/operation-log.service';
import { ReviewConfigurationService } from '../review/review-configuration.service';
import { ReviewTaskService } from '../review/review-task.service';

import {
  CreateArchiveTemplateVersionDto,
  SubmitArchiveTemplateVersionReviewDto,
  UpdateArchiveTemplateVersionDto,
} from './dto/archive-template-version.dto';

const editableStatuses = new Set(['DRAFT', 'REJECTED']);

@Injectable()
export class ArchiveTemplateVersionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewConfiguration: ReviewConfigurationService,
    private readonly reviewTasks: ReviewTaskService,
    private readonly operationLog: OperationLogService,
  ) {}

  async findVersions(templateId: string) {
    await this.assertTemplate(templateId);
    return this.prisma.archiveTemplateVersion.findMany({
      where: { templateId },
      select: {
        id: true,
        templateId: true,
        versionNo: true,
        status: true,
        revision: true,
        sourceVersionId: true,
        submittedAt: true,
        publishedAt: true,
        publishedBy: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { folders: true, versionItems: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findVersion(versionId: string) {
    const version = await this.prisma.archiveTemplateVersion.findUnique({
      where: { id: versionId },
      include: {
        template: {
          select: {
            id: true,
            templateCode: true,
            templateName: true,
            status: true,
            currentPublishedVersionId: true,
          },
        },
        folders: {
          include: { items: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
    if (!version) {
      throw new NotFoundException('档案模板版本不存在');
    }
    return version;
  }

  async createVersion(templateId: string, dto: CreateArchiveTemplateVersionDto, userId: string) {
    const template = await this.prisma.archiveTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, status: true, currentPublishedVersionId: true },
    });
    if (!template) {
      throw new NotFoundException('档案模板不存在');
    }
    if (template.status === 'DISABLED') {
      throw new BadRequestException('已停用的档案模板不能创建新版本');
    }

    const sourceVersionId = dto.sourceVersionId ?? template.currentPublishedVersionId;
    const source = sourceVersionId
      ? await this.prisma.archiveTemplateVersion.findFirst({
          where: { id: sourceVersionId, templateId, status: 'PUBLISHED' },
          include: {
            folders: {
              include: { items: { orderBy: { sortOrder: 'asc' } } },
              orderBy: { sortOrder: 'asc' },
            },
          },
        })
      : null;
    if (sourceVersionId && !source) {
      throw new BadRequestException('源版本不存在、未发布或不属于当前模板');
    }

    const versionNo = dto.versionNo ?? (await this.nextVersionNo(templateId));
    const duplicate = await this.prisma.archiveTemplateVersion.findUnique({
      where: { templateId_versionNo: { templateId, versionNo } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('档案模板版本号已存在');
    }

    const versionId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.archiveTemplateVersion.create({
        data: {
          templateId,
          versionNo,
          sourceVersionId: source?.id,
          createdBy: userId,
          status: 'DRAFT',
        },
        select: { id: true },
      });
      await tx.archiveTemplate.update({
        where: { id: templateId },
        data: { status: 'DRAFT', updatedBy: userId },
      });

      for (const sourceFolder of source?.folders ?? []) {
        const folder = await tx.archiveTemplateFolder.create({
          data: {
            templateVersionId: created.id,
            stableKey: sourceFolder.stableKey,
            name: sourceFolder.name,
            description: sourceFolder.description,
            sortOrder: sourceFolder.sortOrder,
          },
          select: { id: true },
        });
        if (sourceFolder.items.length > 0) {
          await tx.archiveTemplateVersionItem.createMany({
            data: sourceFolder.items.map((item) => ({
              templateVersionId: created.id,
              folderId: folder.id,
              stableKey: item.stableKey,
              name: item.name,
              description: item.description,
              required: item.required,
              reviewRequired: item.reviewRequired,
              approvalTemplateId: item.approvalTemplateId,
              ownerRoleId: item.ownerRoleId,
              allowMultipleFiles: item.allowMultipleFiles,
              allowedExtensions: item.allowedExtensions ?? Prisma.JsonNull,
              maxFileSize: item.maxFileSize,
              namingRule: item.namingRule,
              sortOrder: item.sortOrder,
            })),
          });
        }
      }
      return created.id;
    });

    await this.operationLog.log({
      userId,
      module: 'archive-template',
      action: 'create_version',
      targetType: 'archive_template_version',
      targetId: versionId,
      afterData: { templateId, versionNo, sourceVersionId: source?.id ?? null },
    });
    return this.findVersion(versionId);
  }

  async replaceDraftStructure(
    versionId: string,
    dto: UpdateArchiveTemplateVersionDto,
    userId: string,
  ) {
    const version = await this.prisma.archiveTemplateVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        status: true,
        revision: true,
        templateId: true,
        versionNo: true,
      },
    });
    if (!version) {
      throw new NotFoundException('档案模板版本不存在');
    }
    if (!editableStatuses.has(version.status)) {
      throw new BadRequestException('只有草稿或已驳回版本可以修改');
    }
    if (version.revision !== dto.revision) {
      throw new ConflictException('档案模板版本已被其他用户更新，请刷新后重试');
    }
    this.assertUniqueStableKeys(dto);
    await this.assertReferencedConfiguration(dto);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.archiveTemplateVersion.updateMany({
        where: {
          id: versionId,
          revision: dto.revision,
          status: { in: [...editableStatuses] },
        },
        data: {
          revision: { increment: 1 },
          status: 'DRAFT',
          submittedAt: null,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('档案模板版本已被其他用户更新，请刷新后重试');
      }
      await tx.archiveTemplateFolder.deleteMany({
        where: { templateVersionId: versionId },
      });
      for (const folderDto of dto.folders) {
        const folder = await tx.archiveTemplateFolder.create({
          data: {
            templateVersionId: versionId,
            stableKey: folderDto.stableKey,
            name: folderDto.name,
            description: folderDto.description,
            sortOrder: folderDto.sortOrder ?? 0,
          },
          select: { id: true },
        });
        if (folderDto.items.length > 0) {
          await tx.archiveTemplateVersionItem.createMany({
            data: folderDto.items.map((item) => ({
              templateVersionId: versionId,
              folderId: folder.id,
              stableKey: item.stableKey,
              name: item.name,
              description: item.description,
              required: item.required ?? true,
              reviewRequired: item.reviewRequired ?? false,
              approvalTemplateId: item.approvalTemplateId,
              ownerRoleId: item.ownerRoleId,
              allowMultipleFiles: item.allowMultipleFiles ?? false,
              allowedExtensions: item.allowedExtensions ?? Prisma.JsonNull,
              maxFileSize: item.maxFileSize === undefined ? null : BigInt(item.maxFileSize),
              namingRule: item.namingRule,
              sortOrder: item.sortOrder ?? 0,
            })),
          });
        }
      }
      await tx.archiveTemplate.update({
        where: { id: version.templateId },
        data: { status: 'DRAFT', updatedBy: userId },
      });
    });

    await this.operationLog.log({
      userId,
      module: 'archive-template',
      action: 'replace_draft_structure',
      targetType: 'archive_template_version',
      targetId: versionId,
      afterData: {
        folderCount: dto.folders.length,
        itemCount: dto.folders.reduce((total, folder) => total + folder.items.length, 0),
      },
    });
    return this.findVersion(versionId);
  }

  async submitReview(
    versionId: string,
    dto: SubmitArchiveTemplateVersionReviewDto,
    userId: string,
  ) {
    const version = await this.prisma.archiveTemplateVersion.findUnique({
      where: { id: versionId },
      include: {
        template: { select: { templateName: true, countryCode: true } },
        _count: { select: { folders: true, versionItems: true } },
      },
    });
    if (!version) {
      throw new NotFoundException('档案模板版本不存在');
    }
    if (!editableStatuses.has(version.status)) {
      throw new BadRequestException('当前版本状态不能提交审核');
    }
    if (version._count.folders === 0 || version._count.versionItems === 0) {
      throw new BadRequestException('档案模板版本至少需要一个文件夹和一个文件项');
    }

    const configuration = await this.reviewConfiguration.resolve(dto.approvalTemplateId, userId);
    return this.reviewTasks.createTask({
      sourceType: 'ARCHIVE_TEMPLATE',
      sourceId: version.id,
      sourceVersionId: version.id,
      approvalTemplateId: configuration.approvalTemplateId,
      approvalTemplateVersion: configuration.approvalTemplateVersion,
      approvalSnapshot: configuration.snapshot,
      title: `${version.template.templateName} ${version.versionNo}`,
      locationLabel: '档案模板',
      reviewMode: configuration.reviewMode,
      submittedBy: userId,
      steps: configuration.steps,
    });
  }

  async approveAssignedReviewStep(versionId: string, actor: JwtPayload) {
    const version = await this.prisma.archiveTemplateVersion.findUnique({
      where: { id: versionId },
      include: { _count: { select: { folders: true, versionItems: true } } },
    });
    if (!version) {
      throw new NotFoundException('档案模板版本不存在');
    }
    if (version.status !== 'IN_REVIEW') {
      throw new BadRequestException('只有审核中的版本可以发布');
    }
    if (version._count.folders === 0 || version._count.versionItems === 0) {
      throw new BadRequestException('空档案模板版本不能发布');
    }

    const pendingTask = await this.prisma.reviewTask.findFirst({
      where: {
        sourceType: 'ARCHIVE_TEMPLATE',
        sourceId: versionId,
        sourceVersionId: versionId,
        status: 'PENDING',
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!pendingTask) {
      throw new BadRequestException('审核中的档案模板版本缺少统一审核任务，不能直接发布');
    }
    await this.reviewTasks.approve(pendingTask.id, '档案模板版本审核通过', actor);
    return this.findVersion(versionId);
  }

  async disable(templateId: string, userId: string) {
    await this.assertTemplate(templateId);
    const result = await this.prisma.archiveTemplate.update({
      where: { id: templateId },
      data: { status: 'DISABLED', updatedBy: userId },
    });
    await this.operationLog.log({
      userId,
      module: 'archive-template',
      action: 'disable',
      targetType: 'archive_template',
      targetId: templateId,
    });
    return result;
  }

  private assertUniqueStableKeys(dto: UpdateArchiveTemplateVersionDto): void {
    const folderKeys = new Set<string>();
    const itemKeys = new Set<string>();
    for (const folder of dto.folders) {
      if (folderKeys.has(folder.stableKey)) {
        throw new BadRequestException(`文件夹稳定标识重复：${folder.stableKey}`);
      }
      folderKeys.add(folder.stableKey);
      for (const item of folder.items) {
        if (itemKeys.has(item.stableKey)) {
          throw new BadRequestException(`文件项稳定标识重复：${item.stableKey}`);
        }
        itemKeys.add(item.stableKey);
      }
    }
  }

  private async assertReferencedConfiguration(dto: UpdateArchiveTemplateVersionDto): Promise<void> {
    const items = dto.folders.flatMap((folder) => folder.items);
    const roleIds = Array.from(
      new Set(items.map((item) => item.ownerRoleId).filter((id): id is string => Boolean(id))),
    );
    const approvalTemplateIds = Array.from(
      new Set(
        items.map((item) => item.approvalTemplateId).filter((id): id is string => Boolean(id)),
      ),
    );
    const [activeRoleCount, activeApprovalCount] = await Promise.all([
      roleIds.length
        ? this.prisma.role.count({ where: { id: { in: roleIds }, status: 'Active' } })
        : 0,
      approvalTemplateIds.length
        ? this.prisma.approvalTemplate.count({
            where: { id: { in: approvalTemplateIds }, isEnabled: true },
          })
        : 0,
    ]);
    if (activeRoleCount !== roleIds.length) {
      throw new BadRequestException('文件项负责人角色不存在或已停用');
    }
    if (activeApprovalCount !== approvalTemplateIds.length) {
      throw new BadRequestException('文件项审批模板不存在或已停用');
    }
  }

  private async nextVersionNo(templateId: string): Promise<string> {
    const versions = await this.prisma.archiveTemplateVersion.findMany({
      where: { templateId },
      select: { versionNo: true },
    });
    let major = 1;
    let minor = -1;
    for (const version of versions) {
      const match = /^V?(\d+)(?:\.(\d+))?$/i.exec(version.versionNo.trim());
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

  private async assertTemplate(templateId: string): Promise<void> {
    const template = await this.prisma.archiveTemplate.findUnique({
      where: { id: templateId },
      select: { id: true },
    });
    if (!template) {
      throw new NotFoundException('档案模板不存在');
    }
  }
}
