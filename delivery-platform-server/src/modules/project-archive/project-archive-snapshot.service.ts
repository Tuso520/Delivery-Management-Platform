import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface ProjectArchiveSnapshotRequest {
  projectType?: string;
  countryCode: string;
  languageCode?: string;
  archiveTemplateId?: string;
  archiveTemplateVersionId?: string;
}

export interface ProjectArchiveSnapshotResult {
  templateId: string;
  templateVersionId: string;
  source: 'PUBLISHED_VERSION';
  folderCount: number;
  itemCount: number;
}

type PublishedVersionSnapshot = Prisma.ArchiveTemplateVersionGetPayload<{
  include: {
    template: {
      select: {
        id: true;
        templateCode: true;
        templateName: true;
        status: true;
        currentPublishedVersionId: true;
      };
    };
    folders: { include: { items: true } };
  };
}>;

type TemplateCandidate = Prisma.ArchiveTemplateGetPayload<{
  include: {
    currentPublishedVersion: {
      include: { folders: { include: { items: true } } };
    };
  };
}>;

type ResolvedTemplate = { kind: 'PUBLISHED_VERSION'; version: PublishedVersionSnapshot };

@Injectable()
export class ProjectArchiveSnapshotService {
  async createProjectSnapshot(
    tx: Prisma.TransactionClient,
    projectId: string,
    request: ProjectArchiveSnapshotRequest,
  ): Promise<ProjectArchiveSnapshotResult> {
    const resolved = await this.resolveTemplate(tx, request);
    return this.copyPublishedVersion(tx, projectId, resolved.version);
  }

  private async resolveTemplate(
    tx: Prisma.TransactionClient,
    request: ProjectArchiveSnapshotRequest,
  ): Promise<ResolvedTemplate> {
    if (request.archiveTemplateVersionId) {
      const version = await tx.archiveTemplateVersion.findFirst({
        where: {
          id: request.archiveTemplateVersionId,
          status: 'PUBLISHED',
          ...(request.archiveTemplateId ? { templateId: request.archiveTemplateId } : {}),
          template: { status: { not: 'DISABLED' } },
        },
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
        throw new BadRequestException('指定档案模板版本不存在、未发布或不属于指定模板');
      }
      if (version.template.currentPublishedVersionId !== version.id) {
        throw new BadRequestException('创建项目只能使用模板当前已发布版本');
      }
      return { kind: 'PUBLISHED_VERSION', version };
    }

    const candidates = await tx.archiveTemplate.findMany({
      where: {
        ...(request.archiveTemplateId ? { id: request.archiveTemplateId } : {}),
        status: { not: 'DISABLED' },
      },
      include: {
        currentPublishedVersion: {
          include: {
            folders: {
              include: {
                items: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
              },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            },
          },
        },
      },
    });

    const compatible = candidates.filter((candidate) =>
      request.archiveTemplateId
        ? candidate.id === request.archiveTemplateId
        : this.matchesProject(candidate, request),
    );
    if (request.archiveTemplateId && compatible.length === 0) {
      throw new BadRequestException('指定档案模板不存在或已停用');
    }

    const publishedCandidates = compatible.filter(
      (candidate) =>
        candidate.currentPublishedVersion?.status === 'PUBLISHED' &&
        candidate.currentPublishedVersionId === candidate.currentPublishedVersion.id,
    );
    if (publishedCandidates.length > 0) {
      const selected = this.selectBestCandidate(publishedCandidates, request);
      const current = selected.currentPublishedVersion;
      if (!current) {
        throw new BadRequestException('档案模板当前发布版本无效');
      }
      return {
        kind: 'PUBLISHED_VERSION',
        version: {
          ...current,
          template: {
            id: selected.id,
            templateCode: selected.templateCode,
            templateName: selected.templateName,
            status: selected.status,
            currentPublishedVersionId: selected.currentPublishedVersionId,
          },
        },
      };
    }

    const invalidPublishedPointer = compatible.some(
      (candidate) =>
        candidate.currentPublishedVersionId !== null &&
        candidate.currentPublishedVersion?.status !== 'PUBLISHED',
    );
    if (invalidPublishedPointer) {
      throw new BadRequestException('档案模板当前发布版本状态异常，请先修复模板');
    }

    throw new BadRequestException(
      request.archiveTemplateId
        ? '指定档案模板没有可用的当前已发布版本'
        : '没有匹配的已发布档案模板；请先完成模板迁移并发布',
    );
  }

  private matchesProject(
    candidate: Pick<TemplateCandidate, 'projectType' | 'countryCode' | 'languageCode'>,
    request: ProjectArchiveSnapshotRequest,
  ): boolean {
    const languageCode = request.languageCode ?? 'zh-CN';
    return (
      (candidate.projectType === null || candidate.projectType === request.projectType) &&
      (candidate.countryCode === null || candidate.countryCode === request.countryCode) &&
      (candidate.languageCode === null || candidate.languageCode === languageCode)
    );
  }

  private selectBestCandidate<T extends TemplateCandidate>(
    candidates: T[],
    request: ProjectArchiveSnapshotRequest,
  ): T {
    if (candidates.length === 1 || request.archiveTemplateId) {
      return candidates[0];
    }
    const languageCode = request.languageCode ?? 'zh-CN';
    const scored = candidates
      .map((candidate) => ({
        candidate,
        score:
          (candidate.projectType === request.projectType && request.projectType ? 4 : 0) +
          (candidate.countryCode === request.countryCode ? 2 : 0) +
          (candidate.languageCode === languageCode ? 1 : 0),
      }))
      .sort((left, right) => right.score - left.score);
    if (scored.length > 1 && scored[0].score === scored[1].score) {
      throw new BadRequestException('匹配到多个同优先级档案模板，请明确选择模板');
    }
    return scored[0].candidate;
  }

  private async copyPublishedVersion(
    tx: Prisma.TransactionClient,
    projectId: string,
    version: PublishedVersionSnapshot,
  ): Promise<ProjectArchiveSnapshotResult> {
    const itemCount = version.folders.reduce((total, folder) => total + folder.items.length, 0);
    if (version.folders.length === 0 || itemCount === 0) {
      throw new BadRequestException('已发布档案模板版本为空，不能创建项目');
    }

    const ownerByRoleId = await this.buildOwnerByRoleId(tx, projectId);
    for (const templateFolder of version.folders) {
      const folder = await tx.projectArchiveFolder.create({
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
      if (templateFolder.items.length > 0) {
        await tx.projectArchiveEntry.createMany({
          data: templateFolder.items.map((item) => ({
            projectId,
            folderId: folder.id,
            templateVersionId: version.id,
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
      }
    }

    await tx.project.update({
      where: { id: projectId },
      data: {
        archiveTemplateId: version.template.id,
        archiveTemplateVersionId: version.id,
      },
    });
    return {
      templateId: version.template.id,
      templateVersionId: version.id,
      source: 'PUBLISHED_VERSION',
      folderCount: version.folders.length,
      itemCount,
    };
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
}
