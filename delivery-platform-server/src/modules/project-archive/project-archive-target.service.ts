import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ProjectAccessService } from '../project/project-access.service';

import {
  ArchiveProjectItemDto,
  CreateTemporaryArchiveItemDto,
  SyncProjectArchiveTemplateDto,
} from './dto/project-archive.dto';

type ArchiveActor = Pick<JwtPayload, 'sub' | 'permissions' | 'roles'>;

const pendingReviewStatuses = ['PENDING', 'IN_PROGRESS'] as const;
const completedArchiveStatuses = new Set(['APPROVED', 'PUBLISHED', 'COMPLETED', 'ARCHIVED']);

@Injectable()
export class ProjectArchiveTargetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async getArchiveTree(projectId: string, actor: ArchiveActor) {
    const scope = await this.projectAccess.buildProjectWhere(actor.sub);
    const project = await this.prisma.project.findFirst({
      where: { AND: [scope, { id: projectId }] },
      select: {
        id: true,
        projectCode: true,
        projectName: true,
        currentStage: true,
        archiveTemplateId: true,
        archiveTemplateVersionId: true,
        archiveTemplateVersion: {
          select: { id: true, versionNo: true },
        },
        archiveTemplate: {
          select: {
            id: true,
            currentPublishedVersion: {
              select: { id: true, versionNo: true, status: true },
            },
          },
        },
        archiveFolders: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            description: true,
            sortOrder: true,
            sourceStableKey: true,
            isTemporary: true,
            archivedAt: true,
            items: {
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              select: {
                id: true,
                name: true,
                description: true,
                required: true,
                reviewRequired: true,
                approvalTemplateId: true,
                ownerRoleId: true,
                allowMultipleFiles: true,
                allowedExtensions: true,
                maxFileSize: true,
                namingRule: true,
                sourceStableKey: true,
                isTemporary: true,
                temporaryReason: true,
                archivedAt: true,
                updatedAt: true,
                ownerUser: {
                  select: { id: true, realName: true, username: true },
                },
                files: {
                  where: { archivedAt: null },
                  orderBy: { updatedAt: 'desc' },
                  select: {
                    id: true,
                    status: true,
                    updatedAt: true,
                    logicalFile: {
                      select: {
                        id: true,
                        displayName: true,
                        status: true,
                        currentVersion: {
                          select: {
                            id: true,
                            version: true,
                            status: true,
                            uploadedAt: true,
                            uploadedBy: true,
                            reviewTasks: {
                              where: { archivedAt: null },
                              select: {
                                id: true,
                                title: true,
                                status: true,
                                dueAt: true,
                                submittedBy: true,
                                steps: {
                                  where: { status: 'ACTIVE' },
                                  select: {
                                    assignees: {
                                      where: { status: 'PENDING' },
                                      select: { assigneeUserId: true },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                        versions: {
                          where: { archivedAt: null },
                          orderBy: { versionSequence: 'desc' },
                          take: 10,
                          select: {
                            id: true,
                            version: true,
                            status: true,
                            uploadedAt: true,
                            uploadedBy: true,
                            reviewTasks: {
                              where: { archivedAt: null },
                              select: {
                                id: true,
                                title: true,
                                status: true,
                                dueAt: true,
                                submittedBy: true,
                                steps: {
                                  where: { status: 'ACTIVE' },
                                  select: {
                                    assignees: {
                                      where: { status: 'PENDING' },
                                      select: { assigneeUserId: true },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    if (!project.currentStage) {
      throw new BadRequestException('项目尚未完成目标阶段迁移，不能读取目标档案树');
    }

    const canUpload = this.hasPermission(actor, 'archive:upload');
    const canArchive = this.hasPermission(actor, 'archive:item:archive');
    const folders = project.archiveFolders.map((folder) => {
      const items = folder.items.map((item) => {
        const currentFile = item.files[0] ?? null;
        const versionCandidates = item.files.flatMap((file) =>
          file.logicalFile.versions.map((version) => ({ file, version })),
        );
        const newestFirst = (
          left: (typeof versionCandidates)[number],
          right: (typeof versionCandidates)[number],
        ) => right.version.uploadedAt.getTime() - left.version.uploadedAt.getTime();
        const pendingCandidates = versionCandidates.filter((candidate) =>
          candidate.version.reviewTasks.some((task) =>
            pendingReviewStatuses.includes(task.status as (typeof pendingReviewStatuses)[number]),
          ),
        );
        const pendingCandidate = pendingCandidates.sort(newestFirst)[0];
        const rejectedCandidate = versionCandidates
          .filter((candidate) => candidate.version.status === 'REJECTED')
          .sort(newestFirst)[0];
        const workflowCandidate = pendingCandidate ?? rejectedCandidate;
        const approvedCurrent = currentFile?.logicalFile.currentVersion ?? null;
        const presentedVersion = workflowCandidate?.version ?? approvedCurrent;
        const presentedFile = workflowCandidate?.file ?? currentFile;
        const pendingTasks = pendingCandidates.flatMap((candidate) =>
          candidate.version.reviewTasks.filter((task) =>
            pendingReviewStatuses.includes(task.status as (typeof pendingReviewStatuses)[number]),
          ),
        );
        const status = item.archivedAt
          ? 'ARCHIVED'
          : pendingTasks.length > 0
            ? 'REVIEWING'
            : (workflowCandidate?.version.status ??
              approvedCurrent?.status ??
              currentFile?.status ??
              'NOT_STARTED');
        const workflowTasks = workflowCandidate?.version.reviewTasks ?? [];
        const canPreviewWorkflowVersion =
          !workflowCandidate ||
          actor.roles.includes('SUPER_ADMIN') ||
          actor.permissions.some((permission) =>
            ['file:preview_pending', 'file:preview_history'].includes(permission),
          ) ||
          workflowCandidate.version.uploadedBy === actor.sub ||
          workflowTasks.some(
            (task) =>
              task.submittedBy === actor.sub ||
              task.steps.some((step) =>
                step.assignees.some((assignee) => assignee.assigneeUserId === actor.sub),
              ),
          );
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          required: item.required,
          reviewRequired: item.reviewRequired,
          approvalTemplateId: item.approvalTemplateId,
          ownerRoleId: item.ownerRoleId,
          allowMultipleFiles: item.allowMultipleFiles,
          allowedExtensions: item.allowedExtensions,
          maxFileSize: item.maxFileSize,
          namingRule: item.namingRule,
          sourceStableKey: item.sourceStableKey,
          isTemporary: item.isTemporary,
          temporaryReason: item.temporaryReason,
          archivedAt: item.archivedAt,
          status,
          currentVersion: presentedVersion
            ? {
                id: presentedVersion.id,
                version: presentedVersion.version,
                status: presentedVersion.status,
                uploadedAt: presentedVersion.uploadedAt,
                logicalFileId: presentedFile?.logicalFile.id,
                previewIdentifier: workflowCandidate
                  ? workflowCandidate.version.id
                  : presentedFile?.logicalFile.id,
                displayName: presentedFile?.logicalFile.displayName,
                pendingReview: Boolean(pendingCandidate),
                canPreview: canPreviewWorkflowVersion,
              }
            : null,
          fileCount: item.files.length,
          owner: item.ownerUser,
          updatedAt: presentedVersion?.uploadedAt ?? item.updatedAt,
          canUpload: canUpload && !item.archivedAt && !folder.archivedAt,
          canArchive: canArchive && !item.archivedAt,
          canRestore: canArchive && Boolean(item.archivedAt),
          pendingReviewSummary: {
            count: pendingTasks.length,
            tasks: pendingTasks.map((task) => ({
              id: task.id,
              title: task.title,
              status: task.status,
              dueAt: task.dueAt,
            })),
          },
        };
      });
      const activeItems = items.filter((item) => !item.archivedAt);
      const completedItems = activeItems.filter((item) =>
        completedArchiveStatuses.has(item.status.toUpperCase()),
      );
      const requiredItems = activeItems.filter((item) => item.required);
      const requiredCompletedItems = requiredItems.filter((item) =>
        completedArchiveStatuses.has(item.status.toUpperCase()),
      );
      return {
        id: folder.id,
        name: folder.name,
        description: folder.description,
        sortOrder: folder.sortOrder,
        sourceStableKey: folder.sourceStableKey,
        isTemporary: folder.isTemporary,
        archivedAt: folder.archivedAt,
        completedCount: completedItems.length,
        totalCount: activeItems.length,
        requiredCompletedCount: requiredCompletedItems.length,
        requiredTotalCount: requiredItems.length,
        items,
      };
    });
    const diff = await this.getTemplateDiffFromProject(projectId, project.archiveTemplateId);

    return {
      project: {
        id: project.id,
        code: project.projectCode,
        name: project.projectName,
        currentStage: project.currentStage,
      },
      template: {
        id: project.archiveTemplateId,
        version: project.archiveTemplateVersion?.versionNo ?? null,
        latestVersion: project.archiveTemplate?.currentPublishedVersion?.versionNo ?? null,
        hasDiff: diff.hasDiff,
      },
      folders,
    };
  }

  async getTemplateDiff(projectId: string, actor: ArchiveActor) {
    const project = await this.findScopedProject(projectId, actor.sub, {
      archiveTemplateId: true,
    });
    return this.getTemplateDiffFromProject(projectId, project.archiveTemplateId);
  }

  async syncTemplateAdditions(
    projectId: string,
    dto: SyncProjectArchiveTemplateDto,
    actor: ArchiveActor,
  ) {
    if (!dto.confirmAdditions) {
      throw new BadRequestException('必须明确确认仅新增同步');
    }
    const scope = await this.projectAccess.buildProjectWhere(actor.sub);
    const result = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { AND: [scope, { id: projectId }] },
        select: {
          id: true,
          archiveTemplateId: true,
          archiveTemplateVersionId: true,
          archiveFolders: {
            select: {
              id: true,
              sourceStableKey: true,
              items: { select: { sourceStableKey: true } },
            },
          },
          archiveTemplate: {
            select: {
              currentPublishedVersion: {
                select: {
                  id: true,
                  versionNo: true,
                  status: true,
                  folders: {
                    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                    select: {
                      id: true,
                      stableKey: true,
                      name: true,
                      description: true,
                      sortOrder: true,
                      items: {
                        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                        select: {
                          id: true,
                          stableKey: true,
                          name: true,
                          description: true,
                          required: true,
                          reviewRequired: true,
                          approvalTemplateId: true,
                          ownerRoleId: true,
                          allowMultipleFiles: true,
                          allowedExtensions: true,
                          maxFileSize: true,
                          namingRule: true,
                          sortOrder: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!project) {
        throw new NotFoundException('项目不存在');
      }
      const latest = project.archiveTemplate?.currentPublishedVersion;
      if (!project.archiveTemplateId || !latest || latest.status !== 'PUBLISHED') {
        throw new BadRequestException('项目没有可同步的当前已发布档案模板版本');
      }
      const historicalSnapshot = project.archiveFolders.some((folder) =>
        folder.sourceStableKey?.startsWith('legacy-folder:'),
      );
      if (!project.archiveTemplateVersionId && historicalSnapshot) {
        throw new BadRequestException('历史档案快照需先完成稳定标识迁移，不能直接同步');
      }

      const existingFolders = new Map(
        project.archiveFolders
          .filter((folder): folder is typeof folder & { sourceStableKey: string } =>
            Boolean(folder.sourceStableKey),
          )
          .map((folder) => [folder.sourceStableKey, folder]),
      );
      const existingItemKeys = new Set(
        project.archiveFolders.flatMap((folder) =>
          folder.items
            .map((item) => item.sourceStableKey)
            .filter((key): key is string => Boolean(key)),
        ),
      );
      this.assertRequestedStableKeys(dto, latest.folders);

      const folderFilter = dto.folderStableKeys ? new Set(dto.folderStableKeys) : null;
      const itemFilter = dto.itemStableKeys ? new Set(dto.itemStableKeys) : null;
      const ownerByRoleId = await this.buildOwnerByRoleId(tx, projectId);
      const addedFolderKeys: string[] = [];
      const addedItemKeys: string[] = [];

      for (const templateFolder of latest.folders) {
        const folderSelected = folderFilter?.has(templateFolder.stableKey) ?? false;
        const missingItems = templateFolder.items.filter((item) => {
          if (existingItemKeys.has(item.stableKey)) return false;
          if (itemFilter) return itemFilter.has(item.stableKey);
          if (folderFilter) return folderSelected;
          return true;
        });
        const shouldCreateFolder =
          !existingFolders.has(templateFolder.stableKey) &&
          ((!folderFilter && !itemFilter) || folderSelected || missingItems.length > 0);

        let folderId = existingFolders.get(templateFolder.stableKey)?.id;
        if (shouldCreateFolder) {
          const createdFolder = await tx.projectArchiveFolder.create({
            data: {
              projectId,
              name: templateFolder.name,
              description: templateFolder.description,
              sortOrder: templateFolder.sortOrder,
              sourceTemplateFolderId: templateFolder.id,
              sourceStableKey: templateFolder.stableKey,
              isTemporary: false,
            },
            select: { id: true },
          });
          folderId = createdFolder.id;
          addedFolderKeys.push(templateFolder.stableKey);
        }
        if (!folderId || missingItems.length === 0) continue;

        await tx.projectArchiveEntry.createMany({
          data: missingItems.map((item) => ({
            projectId,
            folderId,
            templateVersionId: latest.id,
            sourceTemplateItemId: item.id,
            sourceStableKey: item.stableKey,
            name: item.name,
            description: item.description,
            required: item.required,
            reviewRequired: item.reviewRequired,
            approvalTemplateId: item.approvalTemplateId,
            ownerUserId: item.ownerRoleId ? (ownerByRoleId.get(item.ownerRoleId) ?? null) : null,
            ownerRoleId: item.ownerRoleId,
            allowMultipleFiles: item.allowMultipleFiles,
            allowedExtensions: item.allowedExtensions ?? Prisma.JsonNull,
            maxFileSize: item.maxFileSize,
            namingRule: item.namingRule,
            sortOrder: item.sortOrder,
            isTemporary: false,
          })),
        });
        for (const item of missingItems) {
          existingItemKeys.add(item.stableKey);
          addedItemKeys.push(item.stableKey);
        }
      }

      await tx.operationLog.create({
        data: {
          userId: actor.sub,
          module: 'project-archive',
          action: 'template_sync_additions',
          targetType: 'project',
          targetId: projectId,
          result: 'success',
          afterData: {
            sourceProjectVersionId: project.archiveTemplateVersionId,
            targetTemplateVersionId: latest.id,
            targetTemplateVersion: latest.versionNo,
            addedFolderKeys,
            addedItemKeys,
            syncMode: 'ADD_ONLY',
          },
        },
      });
      return {
        targetTemplateVersionId: latest.id,
        targetTemplateVersion: latest.versionNo,
        addedFolderKeys,
        addedItemKeys,
      };
    });

    return {
      ...result,
      syncMode: 'ADD_ONLY',
      diff: await this.getTemplateDiff(projectId, actor),
    };
  }

  async createTemporaryItem(
    projectId: string,
    folderId: string,
    dto: CreateTemporaryArchiveItemDto,
    actor: ArchiveActor,
  ) {
    const scope = await this.projectAccess.buildProjectWhere(actor.sub);
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { AND: [scope, { id: projectId }] },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('项目不存在');
      const folder = await tx.projectArchiveFolder.findFirst({
        where: { id: folderId, projectId, archivedAt: null },
        select: { id: true },
      });
      if (!folder) throw new NotFoundException('档案文件夹不存在');
      const owner = await tx.projectMember.findFirst({
        where: {
          projectId,
          userId: dto.ownerUserId,
          deletedAt: null,
          user: { status: 'Active', deletedAt: null },
        },
        select: { userId: true },
      });
      if (!owner) {
        throw new BadRequestException('临时档案项负责人必须是当前项目的有效成员');
      }
      const reviewRequired = dto.reviewRequired ?? false;
      if (reviewRequired && !dto.approvalTemplateId) {
        throw new BadRequestException('需要审核的临时档案项必须选择审批模板');
      }
      if (!reviewRequired && dto.approvalTemplateId) {
        throw new BadRequestException('无需审核的临时档案项不能配置审批模板');
      }
      if (reviewRequired) {
        const approvalTemplate = await tx.approvalTemplate.findFirst({
          where: {
            id: dto.approvalTemplateId,
            businessType: 'PROJECT_ARCHIVE_FILE',
            isEnabled: true,
            deletedAt: null,
            steps: { some: {} },
          },
          select: { id: true },
        });
        if (!approvalTemplate) {
          throw new BadRequestException('审批模板不存在、已停用或不适用于项目档案');
        }
      }
      const maxSort = await tx.projectArchiveEntry.aggregate({
        where: { folderId },
        _max: { sortOrder: true },
      });
      const item = await tx.projectArchiveEntry.create({
        data: {
          projectId,
          folderId,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          required: dto.required ?? false,
          reviewRequired,
          approvalTemplateId: reviewRequired ? dto.approvalTemplateId : null,
          ownerUserId: dto.ownerUserId,
          allowMultipleFiles: dto.allowMultipleFiles ?? false,
          allowedExtensions: dto.allowedExtensions
            ? dto.allowedExtensions.map((extension) =>
                extension.trim().replace(/^\./, '').toLowerCase(),
              )
            : Prisma.JsonNull,
          sortOrder: (maxSort._max.sortOrder ?? 0) + 10,
          isTemporary: true,
          temporaryReason: dto.reason.trim(),
          suggestedForTemplate: dto.suggestedForTemplate ?? false,
        },
      });
      await tx.operationLog.create({
        data: {
          userId: actor.sub,
          module: 'project-archive',
          action: 'create_temporary_item',
          targetType: 'project_archive_item',
          targetId: item.id,
          result: 'success',
          afterData: {
            projectId,
            folderId,
            ownerUserId: dto.ownerUserId,
            required: item.required,
            reviewRequired: item.reviewRequired,
            approvalTemplateId: item.approvalTemplateId,
            suggestedForTemplate: item.suggestedForTemplate,
            reason: item.temporaryReason,
          },
        },
      });
      return item;
    });
  }

  async archiveItem(
    projectId: string,
    itemId: string,
    dto: ArchiveProjectItemDto,
    actor: ArchiveActor,
  ) {
    return this.setItemArchiveState(projectId, itemId, true, dto, actor);
  }

  async restoreItem(
    projectId: string,
    itemId: string,
    dto: ArchiveProjectItemDto,
    actor: ArchiveActor,
  ) {
    return this.setItemArchiveState(projectId, itemId, false, dto, actor);
  }

  private async setItemArchiveState(
    projectId: string,
    itemId: string,
    archived: boolean,
    dto: ArchiveProjectItemDto,
    actor: ArchiveActor,
  ) {
    const scope = await this.projectAccess.buildProjectWhere(actor.sub);
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { AND: [scope, { id: projectId }] },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('项目不存在');
      const item = await tx.projectArchiveEntry.findFirst({
        where: { id: itemId, projectId },
      });
      if (!item) throw new NotFoundException('档案项不存在');
      if (archived === Boolean(item.archivedAt)) {
        throw new BadRequestException(archived ? '档案项已归档' : '档案项未归档');
      }
      const archivedAt = archived ? new Date() : null;
      const updated = await tx.projectArchiveEntry.update({
        where: { id: item.id },
        data: { archivedAt },
      });
      await tx.operationLog.create({
        data: {
          userId: actor.sub,
          module: 'project-archive',
          action: archived ? 'archive_item' : 'restore_item',
          targetType: 'project_archive_item',
          targetId: item.id,
          result: 'success',
          beforeData: { archivedAt: item.archivedAt?.toISOString() ?? null },
          afterData: {
            archivedAt: archivedAt?.toISOString() ?? null,
            reason: dto.reason?.trim() ?? null,
          },
        },
      });
      return updated;
    });
  }

  private async findScopedProject<T extends Prisma.ProjectSelect>(
    projectId: string,
    userId: string,
    select: T,
  ): Promise<Prisma.ProjectGetPayload<{ select: T }>> {
    const scope = await this.projectAccess.buildProjectWhere(userId);
    const project = await this.prisma.project.findFirst({
      where: { AND: [scope, { id: projectId }] },
      select,
    });
    if (!project) throw new NotFoundException('项目不存在');
    return project as Prisma.ProjectGetPayload<{ select: T }>;
  }

  private async getTemplateDiffFromProject(projectId: string, archiveTemplateId: string | null) {
    if (!archiveTemplateId) {
      return this.emptyDiff('项目未关联档案模板');
    }
    const [project, template] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: {
          archiveTemplateVersionId: true,
          archiveTemplateVersion: { select: { id: true, versionNo: true } },
          archiveFolders: {
            select: {
              id: true,
              sourceStableKey: true,
              name: true,
              description: true,
              sortOrder: true,
              items: {
                select: {
                  id: true,
                  sourceStableKey: true,
                  name: true,
                  description: true,
                  required: true,
                  reviewRequired: true,
                  approvalTemplateId: true,
                  ownerRoleId: true,
                  allowMultipleFiles: true,
                  allowedExtensions: true,
                  maxFileSize: true,
                  namingRule: true,
                  sortOrder: true,
                  isTemporary: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.archiveTemplate.findUnique({
        where: { id: archiveTemplateId },
        select: {
          currentPublishedVersion: {
            select: {
              id: true,
              versionNo: true,
              status: true,
              folders: {
                orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                select: {
                  id: true,
                  stableKey: true,
                  name: true,
                  description: true,
                  sortOrder: true,
                  items: {
                    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                    select: {
                      id: true,
                      stableKey: true,
                      name: true,
                      description: true,
                      required: true,
                      reviewRequired: true,
                      approvalTemplateId: true,
                      ownerRoleId: true,
                      allowMultipleFiles: true,
                      allowedExtensions: true,
                      maxFileSize: true,
                      namingRule: true,
                      sortOrder: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    if (!project) return this.emptyDiff('项目不存在');
    const latest = template?.currentPublishedVersion;
    if (!latest || latest.status !== 'PUBLISHED') {
      return this.emptyDiff('档案模板没有当前已发布版本', {
        id: project.archiveTemplateVersion?.id ?? null,
        version: project.archiveTemplateVersion?.versionNo ?? null,
      });
    }
    const historicalSnapshot = project.archiveFolders.some((folder) =>
      folder.sourceStableKey?.startsWith('legacy-folder:'),
    );
    if (!project.archiveTemplateVersionId && historicalSnapshot) {
      return {
        ...this.emptyDiff('历史快照需先完成稳定标识迁移'),
        latestVersion: { id: latest.id, version: latest.versionNo },
        hasDiff: true,
        requiresMigration: true,
      };
    }

    const projectFolders = new Map(
      project.archiveFolders
        .filter((folder): folder is typeof folder & { sourceStableKey: string } =>
          Boolean(folder.sourceStableKey),
        )
        .map((folder) => [folder.sourceStableKey, folder]),
    );
    const projectItems = new Map(
      project.archiveFolders
        .flatMap((folder) => folder.items)
        .filter(
          (item): item is typeof item & { sourceStableKey: string } =>
            Boolean(item.sourceStableKey) && !item.isTemporary,
        )
        .map((item) => [item.sourceStableKey, item]),
    );
    const latestFolderKeys = new Set(latest.folders.map((folder) => folder.stableKey));
    const latestItemKeys = new Set(
      latest.folders.flatMap((folder) => folder.items.map((item) => item.stableKey)),
    );
    const addedFolders = latest.folders
      .filter((folder) => !projectFolders.has(folder.stableKey))
      .map((folder) => ({
        stableKey: folder.stableKey,
        name: folder.name,
        sortOrder: folder.sortOrder,
      }));
    const addedItems = latest.folders.flatMap((folder) =>
      folder.items
        .filter((item) => !projectItems.has(item.stableKey))
        .map((item) => ({
          stableKey: item.stableKey,
          folderStableKey: folder.stableKey,
          name: item.name,
          required: item.required,
          reviewRequired: item.reviewRequired,
        })),
    );
    const changedFolders = latest.folders.flatMap((folder) => {
      const existing = projectFolders.get(folder.stableKey);
      if (!existing) return [];
      const fields = this.changedFields(['name', 'description', 'sortOrder'], existing, folder);
      return fields.length > 0 ? [{ stableKey: folder.stableKey, name: folder.name, fields }] : [];
    });
    const changedItems = latest.folders.flatMap((folder) =>
      folder.items.flatMap((item) => {
        const existing = projectItems.get(item.stableKey);
        if (!existing) return [];
        const fields = this.changedItemFields(existing, item);
        return fields.length > 0 ? [{ stableKey: item.stableKey, name: item.name, fields }] : [];
      }),
    );
    const projectOnlyFolders = [...projectFolders.entries()]
      .filter(([key]) => !latestFolderKeys.has(key))
      .map(([stableKey, folder]) => ({ stableKey, name: folder.name }));
    const projectOnlyItems = [...projectItems.entries()]
      .filter(([key]) => !latestItemKeys.has(key))
      .map(([stableKey, item]) => ({ stableKey, name: item.name }));
    const hasDiff =
      addedFolders.length > 0 ||
      addedItems.length > 0 ||
      changedFolders.length > 0 ||
      changedItems.length > 0 ||
      projectOnlyFolders.length > 0 ||
      projectOnlyItems.length > 0;

    return {
      sourceVersion: {
        id: project.archiveTemplateVersion?.id ?? null,
        version: project.archiveTemplateVersion?.versionNo ?? null,
      },
      latestVersion: { id: latest.id, version: latest.versionNo },
      hasDiff,
      canSync: addedFolders.length > 0 || addedItems.length > 0,
      syncMode: 'ADD_ONLY',
      requiresMigration: false,
      additions: { folders: addedFolders, items: addedItems },
      changes: { folders: changedFolders, items: changedItems },
      projectOnly: { folders: projectOnlyFolders, items: projectOnlyItems },
    };
  }

  private emptyDiff(
    reason: string,
    sourceVersion: { id: string | null; version: string | null } = {
      id: null,
      version: null,
    },
  ) {
    return {
      sourceVersion,
      latestVersion: null,
      hasDiff: false,
      canSync: false,
      syncMode: 'ADD_ONLY',
      requiresMigration: false,
      reason,
      additions: { folders: [], items: [] },
      changes: { folders: [], items: [] },
      projectOnly: { folders: [], items: [] },
    };
  }

  private changedFields(
    fields: string[],
    existing: Record<string, unknown>,
    latest: Record<string, unknown>,
  ): string[] {
    return fields.filter((field) => existing[field] !== latest[field]);
  }

  private changedItemFields(
    existing: {
      name: string;
      description: string | null;
      required: boolean;
      reviewRequired: boolean;
      approvalTemplateId: string | null;
      ownerRoleId: string | null;
      allowMultipleFiles: boolean;
      allowedExtensions: Prisma.JsonValue | null;
      maxFileSize: bigint | null;
      namingRule: string | null;
      sortOrder: number;
    },
    latest: typeof existing,
  ): string[] {
    const fields = this.changedFields(
      [
        'name',
        'description',
        'required',
        'reviewRequired',
        'approvalTemplateId',
        'ownerRoleId',
        'allowMultipleFiles',
        'namingRule',
        'sortOrder',
      ],
      existing,
      latest,
    );
    if (JSON.stringify(existing.allowedExtensions) !== JSON.stringify(latest.allowedExtensions)) {
      fields.push('allowedExtensions');
    }
    if (String(existing.maxFileSize) !== String(latest.maxFileSize)) {
      fields.push('maxFileSize');
    }
    return fields;
  }

  private assertRequestedStableKeys(
    dto: SyncProjectArchiveTemplateDto,
    latestFolders: Array<{
      stableKey: string;
      items: Array<{ stableKey: string }>;
    }>,
  ): void {
    const latestFolderKeys = new Set(latestFolders.map((folder) => folder.stableKey));
    const latestItemKeys = new Set(
      latestFolders.flatMap((folder) => folder.items.map((item) => item.stableKey)),
    );
    const invalidFolderKey = dto.folderStableKeys?.find((key) => !latestFolderKeys.has(key));
    if (invalidFolderKey) {
      throw new BadRequestException(`同步文件夹稳定标识无效：${invalidFolderKey}`);
    }
    const invalidItemKey = dto.itemStableKeys?.find((key) => !latestItemKeys.has(key));
    if (invalidItemKey) {
      throw new BadRequestException(`同步文件项稳定标识无效：${invalidItemKey}`);
    }
  }

  private async buildOwnerByRoleId(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<Map<string, string>> {
    const members = await tx.projectMember.findMany({
      where: { projectId, deletedAt: null },
      select: {
        userId: true,
        user: {
          select: {
            userRoles: {
              where: { role: { status: 'Active' } },
              select: { roleId: true },
            },
          },
        },
      },
    });
    const result = new Map<string, string>();
    for (const member of members) {
      for (const assignment of member.user.userRoles) {
        if (!result.has(assignment.roleId)) {
          result.set(assignment.roleId, member.userId);
        }
      }
    }
    return result;
  }

  private hasPermission(actor: ArchiveActor, permission: string): boolean {
    return actor.roles.includes('SUPER_ADMIN') || actor.permissions.includes(permission);
  }
}
