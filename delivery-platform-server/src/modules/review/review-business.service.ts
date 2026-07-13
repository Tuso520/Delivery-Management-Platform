import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const REGISTERED_REVIEW_SOURCE_TYPES = [
  'PROJECT_CREATE',
  'PROJECT_ARCHIVE',
  'ARCHIVE_TEMPLATE',
  'STANDARD',
  'KNOWLEDGE',
] as const;

export type RegisteredReviewSourceType = (typeof REGISTERED_REVIEW_SOURCE_TYPES)[number];

const registeredSources = new Set<string>(REGISTERED_REVIEW_SOURCE_TYPES);
const claimableFileVersionStatuses = ['DRAFT', 'UPLOADED', 'REJECTED'] as const;
const claimableFileVersionStatusSet = new Set<string>(claimableFileVersionStatuses);

interface ReviewBusinessDecisionInput {
  sourceType: string;
  sourceId: string;
  fileVersionId: string | null;
  decision: 'APPROVED' | 'REJECTED';
  actorUserId: string;
  decidedAt: Date;
}

interface BusinessFileVersionState {
  id: string;
  logicalFileId: string;
  status: string;
  archivedAt: Date | null;
}

@Injectable()
export class ReviewBusinessService {
  assertSupported(sourceType: string): asserts sourceType is RegisteredReviewSourceType {
    if (!registeredSources.has(sourceType)) {
      throw new BadRequestException(`审核来源 ${sourceType} 未注册业务状态适配器`);
    }
  }

  async applyDecision(
    tx: Prisma.TransactionClient,
    input: ReviewBusinessDecisionInput,
  ): Promise<void> {
    this.assertSupported(input.sourceType);
    if (input.sourceType === 'PROJECT_CREATE') {
      await this.applyProjectCreateDecision(tx, input);
      return;
    }
    if (input.sourceType === 'PROJECT_ARCHIVE') {
      await this.applyProjectArchiveDecision(tx, input);
      return;
    }
    if (input.sourceType === 'ARCHIVE_TEMPLATE') {
      await this.applyArchiveTemplateDecision(tx, input);
      return;
    }
    if (input.sourceType === 'STANDARD') {
      await this.applyStandardDecision(tx, input);
      return;
    }
    await this.applyKnowledgeDecision(tx, input);
  }

  async applySubmission(
    tx: Prisma.TransactionClient,
    input: {
      sourceType: string;
      sourceId: string;
      fileVersionId: string | null;
      sourceRevision: number | null;
      submittedAt: Date;
      submittedBy: string;
    },
  ): Promise<void> {
    this.assertSupported(input.sourceType);
    if (input.sourceType === 'PROJECT_CREATE') {
      const project = await tx.project.findFirst({
        where: {
          id: input.sourceId,
          deletedAt: null,
          archivedAt: null,
          status: 'DRAFT',
        },
        select: { id: true },
      });
      if (!project) {
        throw new BadRequestException('项目当前状态不能提交新建审核');
      }
      return;
    }
    if (input.sourceType === 'ARCHIVE_TEMPLATE') {
      const version = await tx.archiveTemplateVersion.findUnique({
        where: { id: input.sourceId },
        select: {
          status: true,
          templateId: true,
          template: { select: { status: true } },
        },
      });
      if (!version || !['DRAFT', 'REJECTED'].includes(version.status)) {
        throw new BadRequestException('档案模板版本当前状态不能提交审核');
      }
      if (version.template.status === 'DISABLED') {
        throw new BadRequestException('已停用的档案模板不能提交审核');
      }
      await tx.archiveTemplateVersion.update({
        where: { id: input.sourceId },
        data: {
          status: 'IN_REVIEW',
          submittedAt: input.submittedAt,
          revision: { increment: 1 },
        },
      });
      await tx.archiveTemplate.update({
        where: { id: version.templateId },
        data: { status: 'IN_REVIEW', updatedBy: input.submittedBy },
      });
      return;
    }

    if (input.sourceType === 'STANDARD') {
      await this.lockActiveContentMaster(tx, 'standards', input.sourceId, '标准');
      const version = await tx.standardVersion.findUnique({
        where: { id: input.sourceId },
        select: {
          status: true,
          revision: true,
          fileVersionId: true,
          standardId: true,
        },
      });
      if (!version || !['DRAFT', 'REJECTED'].includes(version.status)) {
        throw new BadRequestException('标准版本当前状态不能提交审核');
      }
      const sourceRevision = this.assertSourceSnapshot(
        input.sourceRevision,
        version.revision,
        input.fileVersionId,
        version.fileVersionId,
        '标准版本',
      );
      const claimed = await tx.standardVersion.updateMany({
        where: {
          id: input.sourceId,
          revision: sourceRevision,
          status: { in: ['DRAFT', 'REJECTED'] },
          fileVersionId: version.fileVersionId,
          archivedAt: null,
        },
        data: {
          status: 'IN_REVIEW',
          submittedAt: input.submittedAt,
          revision: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('标准版本已变更，请刷新后重试');
      }
      await this.claimFileVersionsForReview(tx, [version.fileVersionId]);
      await tx.standard.updateMany({
        where: { id: version.standardId, currentPublishedVersionId: null },
        data: { status: 'IN_REVIEW', updatedBy: input.submittedBy },
      });
      return;
    }

    if (input.sourceType === 'KNOWLEDGE') {
      await this.lockActiveContentMaster(
        tx,
        'knowledge_items',
        input.sourceId,
        '知识条目',
      );
      const version = await tx.knowledgeVersion.findUnique({
        where: { id: input.sourceId },
        select: {
          status: true,
          revision: true,
          fileVersionId: true,
          knowledgeItemId: true,
          supportingFiles: {
            select: { fileVersionId: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
      if (!version || !['DRAFT', 'REJECTED'].includes(version.status)) {
        throw new BadRequestException('知识版本当前状态不能提交审核');
      }
      const sourceRevision = this.assertSourceSnapshot(
        input.sourceRevision,
        version.revision,
        input.fileVersionId,
        version.fileVersionId,
        '知识版本',
      );
      const claimed = await tx.knowledgeVersion.updateMany({
        where: {
          id: input.sourceId,
          revision: sourceRevision,
          status: { in: ['DRAFT', 'REJECTED'] },
          fileVersionId: version.fileVersionId,
          archivedAt: null,
        },
        data: {
          status: 'IN_REVIEW',
          submittedAt: input.submittedAt,
          revision: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('知识版本已变更，请刷新后重试');
      }
      await this.claimFileVersionsForReview(tx, [
        version.fileVersionId,
        ...version.supportingFiles.map((file) => file.fileVersionId),
      ]);
      await tx.knowledgeItem.updateMany({
        where: {
          id: version.knowledgeItemId,
          currentPublishedVersionId: null,
        },
        data: { status: 'IN_REVIEW', updatedBy: input.submittedBy },
      });
      return;
    }

    if (!input.fileVersionId) {
      throw new BadRequestException('项目档案审核缺少文件版本');
    }
    const archiveFile = await tx.projectArchiveFile.findUnique({
      where: { id: input.sourceId },
      select: { logicalFileId: true },
    });
    if (!archiveFile) {
      throw new NotFoundException('项目档案文件不存在');
    }
    const version = await tx.fileVersion.findFirst({
      where: {
        id: input.fileVersionId,
        logicalFileId: archiveFile.logicalFileId,
        archivedAt: null,
      },
      select: { id: true, status: true },
    });
    if (!version || !['UPLOADED', 'REJECTED', 'DRAFT'].includes(version.status)) {
      throw new BadRequestException('文件版本当前状态不能提交审核');
    }
    await tx.fileVersion.update({
      where: { id: version.id },
      data: { status: 'REVIEWING' },
    });
    await tx.projectArchiveFile.update({
      where: { id: input.sourceId },
      data: { status: 'REVIEWING' },
    });
  }

  private async applyProjectCreateDecision(
    tx: Prisma.TransactionClient,
    input: ReviewBusinessDecisionInput,
  ): Promise<void> {
    const project = await tx.project.findFirst({
      where: {
        id: input.sourceId,
        deletedAt: null,
        archivedAt: null,
        status: 'DRAFT',
      },
      select: { id: true },
    });
    if (!project) {
      throw new BadRequestException('项目新建审核对应的草稿项目不存在');
    }
    await tx.project.update({
      where: { id: project.id },
      data:
        input.decision === 'APPROVED'
          ? { status: 'ACTIVE', revision: { increment: 1 } }
          : { status: 'DRAFT', revision: { increment: 1 } },
    });
  }

  private async applyProjectArchiveDecision(
    tx: Prisma.TransactionClient,
    input: ReviewBusinessDecisionInput,
  ): Promise<void> {
    if (!input.fileVersionId) {
      throw new BadRequestException('项目档案审核缺少文件版本');
    }
    const archiveFile = await tx.projectArchiveFile.findUnique({
      where: { id: input.sourceId },
      select: {
        id: true,
        logicalFileId: true,
        logicalFile: {
          select: {
            currentVersion: { select: { id: true, status: true } },
          },
        },
      },
    });
    if (!archiveFile) {
      throw new NotFoundException('项目档案文件不存在');
    }
    const version = await tx.fileVersion.findFirst({
      where: {
        id: input.fileVersionId,
        logicalFileId: archiveFile.logicalFileId,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!version) {
      throw new BadRequestException('审核文件版本不属于当前项目档案文件');
    }

    if (input.decision === 'APPROVED') {
      await tx.fileVersion.update({
        where: { id: version.id },
        data: { status: 'APPROVED', approvedAt: input.decidedAt },
      });
      await tx.logicalFile.update({
        where: { id: archiveFile.logicalFileId },
        data: { currentVersionId: version.id, status: 'APPROVED' },
      });
      await tx.projectArchiveFile.update({
        where: { id: archiveFile.id },
        data: { status: 'APPROVED' },
      });
      return;
    }

    await tx.fileVersion.update({
      where: { id: version.id },
      data: { status: 'REJECTED' },
    });
    const hasApprovedCurrent = archiveFile.logicalFile.currentVersion?.status === 'APPROVED';
    await tx.projectArchiveFile.update({
      where: { id: archiveFile.id },
      data: { status: hasApprovedCurrent ? 'APPROVED' : 'REJECTED' },
    });
  }

  private async applyArchiveTemplateDecision(
    tx: Prisma.TransactionClient,
    input: ReviewBusinessDecisionInput,
  ): Promise<void> {
    if (input.decision === 'REJECTED') {
      const version = await tx.archiveTemplateVersion.update({
        where: { id: input.sourceId },
        data: { status: 'REJECTED', revision: { increment: 1 } },
        select: { templateId: true },
      });
      await tx.archiveTemplate.update({
        where: { id: version.templateId },
        data: { status: 'REJECTED', updatedBy: input.actorUserId },
      });
      return;
    }

    const version = await tx.archiveTemplateVersion.update({
      where: { id: input.sourceId },
      data: {
        status: 'PUBLISHED',
        revision: { increment: 1 },
        publishedAt: input.decidedAt,
        publishedBy: input.actorUserId,
      },
      select: { templateId: true },
    });
    await tx.archiveTemplate.update({
      where: { id: version.templateId },
      data: {
        currentPublishedVersionId: input.sourceId,
        status: 'PUBLISHED',
        updatedBy: input.actorUserId,
      },
    });
  }

  private async applyStandardDecision(
    tx: Prisma.TransactionClient,
    input: ReviewBusinessDecisionInput,
  ): Promise<void> {
    const version = await tx.standardVersion.findUnique({
      where: { id: input.sourceId },
      select: {
        status: true,
        standardId: true,
        fileVersionId: true,
        effectiveAt: true,
      },
    });
    if (!version) {
      throw new NotFoundException('标准版本不存在');
    }
    if (version.status !== 'IN_REVIEW') {
      throw new ConflictException('标准版本已不在审核中');
    }
    this.assertPrimaryFileSnapshot(input.fileVersionId, version.fileVersionId, '标准版本');

    const settled = await tx.standardVersion.updateMany({
      where: {
        id: input.sourceId,
        status: 'IN_REVIEW',
        fileVersionId: version.fileVersionId,
        archivedAt: null,
      },
      data:
        input.decision === 'APPROVED'
          ? {
              status: 'PUBLISHED',
              publishedAt: input.decidedAt,
              revision: { increment: 1 },
            }
          : { status: 'REJECTED', revision: { increment: 1 } },
    });
    if (settled.count !== 1) {
      throw new ConflictException('标准版本审核状态已变更，请刷新后重试');
    }

    await this.applyClaimedFileVersionDecision(
      tx,
      [version.fileVersionId],
      input.decision,
      input.decidedAt,
    );

    if (input.decision === 'REJECTED') {
      await tx.standard.updateMany({
        where: { id: version.standardId, currentPublishedVersionId: null },
        data: { status: 'REJECTED', updatedBy: input.actorUserId },
      });
      return;
    }
    await tx.standard.update({
      where: { id: version.standardId },
      data: {
        status: 'PUBLISHED',
        currentPublishedVersionId: input.sourceId,
        effectiveAt: version.effectiveAt,
        updatedBy: input.actorUserId,
      },
    });
  }

  private async applyKnowledgeDecision(
    tx: Prisma.TransactionClient,
    input: ReviewBusinessDecisionInput,
  ): Promise<void> {
    const version = await tx.knowledgeVersion.findUnique({
      where: { id: input.sourceId },
      select: {
        status: true,
        knowledgeItemId: true,
        fileVersionId: true,
        contentType: true,
        supportingFiles: {
          select: { fileVersionId: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!version) {
      throw new NotFoundException('知识版本不存在');
    }
    if (version.status !== 'IN_REVIEW') {
      throw new ConflictException('知识版本已不在审核中');
    }
    this.assertPrimaryFileSnapshot(input.fileVersionId, version.fileVersionId, '知识版本');

    const settled = await tx.knowledgeVersion.updateMany({
      where: {
        id: input.sourceId,
        status: 'IN_REVIEW',
        fileVersionId: version.fileVersionId,
        archivedAt: null,
      },
      data:
        input.decision === 'APPROVED'
          ? {
              status: 'PUBLISHED',
              publishedAt: input.decidedAt,
              revision: { increment: 1 },
            }
          : { status: 'REJECTED', revision: { increment: 1 } },
    });
    if (settled.count !== 1) {
      throw new ConflictException('知识版本审核状态已变更，请刷新后重试');
    }

    await this.applyClaimedFileVersionDecision(
      tx,
      [version.fileVersionId, ...version.supportingFiles.map((file) => file.fileVersionId)],
      input.decision,
      input.decidedAt,
    );

    if (input.decision === 'REJECTED') {
      await tx.knowledgeItem.updateMany({
        where: {
          id: version.knowledgeItemId,
          currentPublishedVersionId: null,
        },
        data: { status: 'REJECTED', updatedBy: input.actorUserId },
      });
      return;
    }
    await tx.knowledgeItem.update({
      where: { id: version.knowledgeItemId },
      data: {
        status: 'PUBLISHED',
        currentPublishedVersionId: input.sourceId,
        effectiveAt: input.decidedAt,
        contentType: version.contentType,
        updatedBy: input.actorUserId,
      },
    });
  }

  private assertSourceSnapshot(
    sourceRevision: number | null,
    actualRevision: number,
    taskFileVersionId: string | null,
    actualFileVersionId: string | null,
    sourceLabel: string,
  ): number {
    if (sourceRevision === null || !Number.isInteger(sourceRevision) || sourceRevision < 1) {
      throw new BadRequestException(`${sourceLabel}提交审核缺少有效的修订号快照`);
    }
    if (sourceRevision !== actualRevision) {
      throw new ConflictException(`${sourceLabel}已变更，请刷新后重试`);
    }
    this.assertPrimaryFileSnapshot(taskFileVersionId, actualFileVersionId, sourceLabel);
    return sourceRevision;
  }

  private assertPrimaryFileSnapshot(
    taskFileVersionId: string | null,
    actualFileVersionId: string | null,
    sourceLabel: string,
  ): void {
    if (taskFileVersionId !== actualFileVersionId) {
      throw new ConflictException(`${sourceLabel}主文件已变更，请重新提交审核`);
    }
  }

  /**
   * A business review never adopts an already REVIEWING file. Therefore a
   * REVIEWING reference on an immutable IN_REVIEW source is evidence that this
   * source transaction claimed it; APPROVED references are immutable reuse and
   * intentionally remain untouched for submission and either terminal result.
   */
  private async claimFileVersionsForReview(
    tx: Prisma.TransactionClient,
    candidateIds: Array<string | null>,
  ): Promise<void> {
    const versions = await this.loadBusinessFileVersions(tx, candidateIds);
    const toClaim = versions.filter((version) => {
      if (version.archivedAt || version.status === 'ARCHIVED') {
        throw new ConflictException('审核文件已归档，不能提交审核');
      }
      if (version.status === 'APPROVED') return false;
      if (!claimableFileVersionStatusSet.has(version.status)) {
        throw new ConflictException(
          `文件版本 ${version.id} 当前状态 ${version.status} 不能提交审核`,
        );
      }
      return true;
    });
    this.assertDistinctClaimedLogicalFiles(toClaim);
    if (toClaim.length === 0) return;

    const claimed = await tx.fileVersion.updateMany({
      where: {
        id: { in: toClaim.map((version) => version.id) },
        status: { in: [...claimableFileVersionStatuses] },
        archivedAt: null,
      },
      data: { status: 'REVIEWING', approvedAt: null },
    });
    if (claimed.count !== toClaim.length) {
      throw new ConflictException('审核文件状态已变更，请刷新后重试');
    }
  }

  private async lockActiveContentMaster(
    tx: Prisma.TransactionClient,
    table: 'standards' | 'knowledge_items',
    sourceVersionId: string,
    label: string,
  ): Promise<void> {
    const rows =
      table === 'standards'
        ? await tx.$queryRaw<Array<{ id: string; archived_at: Date | null }>>(Prisma.sql`
            SELECT id, archived_at
            FROM standards
            WHERE id = (
              SELECT standard_id
              FROM standard_versions
              WHERE id = ${sourceVersionId}
            )
            FOR UPDATE
          `)
        : await tx.$queryRaw<Array<{ id: string; archived_at: Date | null }>>(Prisma.sql`
            SELECT id, archived_at
            FROM knowledge_items
            WHERE id = (
              SELECT knowledge_item_id
              FROM knowledge_versions_v2
              WHERE id = ${sourceVersionId}
            )
            FOR UPDATE
          `);
    if (rows.length !== 1 || rows[0].archived_at) {
      throw new ConflictException(`${label}已归档或不存在，不能提交审核`);
    }
  }

  private async applyClaimedFileVersionDecision(
    tx: Prisma.TransactionClient,
    candidateIds: Array<string | null>,
    decision: 'APPROVED' | 'REJECTED',
    decidedAt: Date,
  ): Promise<void> {
    const versions = await this.loadBusinessFileVersions(tx, candidateIds);
    const claimedByThisReview = versions.filter((version) => {
      if (version.archivedAt || version.status === 'ARCHIVED') {
        throw new ConflictException('审核文件已归档，无法写入审核结果');
      }
      if (version.status === 'APPROVED') return false;
      if (version.status !== 'REVIEWING') {
        throw new ConflictException(`文件版本 ${version.id} 不属于当前审核任务的可结算状态`);
      }
      return true;
    });
    this.assertDistinctClaimedLogicalFiles(claimedByThisReview);
    if (claimedByThisReview.length === 0) return;

    const settled = await tx.fileVersion.updateMany({
      where: {
        id: { in: claimedByThisReview.map((version) => version.id) },
        status: 'REVIEWING',
        archivedAt: null,
      },
      data:
        decision === 'APPROVED'
          ? { status: 'APPROVED', approvedAt: decidedAt }
          : { status: 'REJECTED', approvedAt: null },
    });
    if (settled.count !== claimedByThisReview.length) {
      throw new ConflictException('审核文件状态已被其他任务变更，请刷新后重试');
    }

    const versionsByLogicalFile = [...claimedByThisReview].sort((left, right) =>
      left.logicalFileId.localeCompare(right.logicalFileId),
    );
    if (decision === 'REJECTED') {
      await this.rejectClaimedLogicalFiles(tx, versionsByLogicalFile);
      return;
    }
    for (const version of versionsByLogicalFile) {
      const promoted = await tx.logicalFile.updateMany({
        where: { id: version.logicalFileId, archivedAt: null },
        data: { currentVersionId: version.id, status: 'APPROVED' },
      });
      if (promoted.count !== 1) {
        throw new ConflictException('审核文件对应的逻辑文件已归档或不存在');
      }
    }
  }

  private async rejectClaimedLogicalFiles(
    tx: Prisma.TransactionClient,
    versions: BusinessFileVersionState[],
  ): Promise<void> {
    for (const version of versions) {
      const logicalFile = await tx.logicalFile.findUnique({
        where: { id: version.logicalFileId },
        select: {
          currentVersionId: true,
          archivedAt: true,
          currentVersion: { select: { status: true } },
        },
      });
      if (!logicalFile || logicalFile.archivedAt) {
        throw new ConflictException('审核文件对应的逻辑文件已归档或不存在');
      }
      if (logicalFile.currentVersion?.status === 'APPROVED') continue;

      const rejected = await tx.logicalFile.updateMany({
        where: {
          id: version.logicalFileId,
          archivedAt: null,
          currentVersionId: logicalFile.currentVersionId,
        },
        data: { status: 'REJECTED' },
      });
      if (rejected.count !== 1) {
        throw new ConflictException('审核文件对应的逻辑文件状态已变更，请刷新后重试');
      }
    }
  }

  private async loadBusinessFileVersions(
    tx: Prisma.TransactionClient,
    candidateIds: Array<string | null>,
  ): Promise<BusinessFileVersionState[]> {
    const ids = [...new Set(candidateIds.filter((id): id is string => Boolean(id)))].sort();
    if (ids.length === 0) return [];
    const lockedRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM file_versions
      WHERE id IN (${Prisma.join(ids)})
      ORDER BY id
      FOR UPDATE
    `);
    const lockedIds = new Set(lockedRows.map((row) => row.id));
    if (
      lockedRows.length !== ids.length ||
      lockedIds.size !== ids.length ||
      ids.some((id) => !lockedIds.has(id))
    ) {
      throw new ConflictException('审核文件不存在或关联已变更');
    }
    const versions = await tx.fileVersion.findMany({
      where: { id: { in: ids } },
      select: { id: true, logicalFileId: true, status: true, archivedAt: true },
      orderBy: { id: 'asc' },
    });
    if (versions.length !== ids.length) {
      throw new ConflictException('审核文件不存在或关联已变更');
    }
    return versions;
  }

  private assertDistinctClaimedLogicalFiles(versions: BusinessFileVersionState[]): void {
    const logicalFileIds = new Set(versions.map((version) => version.logicalFileId));
    if (logicalFileIds.size !== versions.length) {
      throw new ConflictException('同一审核不能同时包含同一逻辑文件的多个待审版本');
    }
  }
}
