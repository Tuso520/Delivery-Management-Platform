import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ProjectAccessService } from '../project/project-access.service';

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
                            asset: { select: { size: true } },
                            uploader: { select: { id: true, realName: true, username: true } },
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
                            asset: { select: { size: true } },
                            uploader: { select: { id: true, realName: true, username: true } },
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
    const canDeleteFile = this.hasPermission(actor, 'file:archive');
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
                fileSize: presentedVersion.asset?.size?.toString() ?? '0',
                uploader: presentedVersion.uploader,
                pendingReview: Boolean(pendingCandidate),
                canPreview: canPreviewWorkflowVersion,
              }
            : null,
          fileCount: item.files.length,
          owner: item.ownerUser,
          updatedAt: presentedVersion?.uploadedAt ?? item.updatedAt,
          canUpload: canUpload && !item.archivedAt && !folder.archivedAt,
          canDeleteFile:
            canDeleteFile &&
            !item.archivedAt &&
            !folder.archivedAt &&
            Boolean(presentedFile?.logicalFile.id),
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

  private hasPermission(actor: ArchiveActor, permission: string): boolean {
    return actor.roles.includes('SUPER_ADMIN') || actor.permissions.includes(permission);
  }
}
