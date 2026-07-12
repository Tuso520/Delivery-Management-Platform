import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

interface ReviewBusinessDecisionInput {
  sourceType: string;
  sourceId: string;
  fileVersionId: string | null;
  decision: 'APPROVED' | 'REJECTED';
  actorUserId: string;
  decidedAt: Date;
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
      const version = await tx.standardVersion.findUnique({
        where: { id: input.sourceId },
        select: { status: true, fileVersionId: true, standardId: true },
      });
      if (!version || !['DRAFT', 'REJECTED'].includes(version.status)) {
        throw new BadRequestException('标准版本当前状态不能提交审核');
      }
      await tx.standardVersion.update({
        where: { id: input.sourceId },
        data: {
          status: 'IN_REVIEW',
          submittedAt: input.submittedAt,
          revision: { increment: 1 },
        },
      });
      await tx.standard.updateMany({
        where: { id: version.standardId, currentPublishedVersionId: null },
        data: { status: 'IN_REVIEW', updatedBy: input.submittedBy },
      });
      await this.markFileVersionReviewing(tx, version.fileVersionId);
      return;
    }

    if (input.sourceType === 'KNOWLEDGE') {
      const version = await tx.knowledgeVersion.findUnique({
        where: { id: input.sourceId },
        select: { status: true, fileVersionId: true, knowledgeItemId: true },
      });
      if (!version || !['DRAFT', 'REJECTED'].includes(version.status)) {
        throw new BadRequestException('知识版本当前状态不能提交审核');
      }
      await tx.knowledgeVersion.update({
        where: { id: input.sourceId },
        data: {
          status: 'IN_REVIEW',
          submittedAt: input.submittedAt,
          revision: { increment: 1 },
        },
      });
      await tx.knowledgeItem.updateMany({
        where: {
          id: version.knowledgeItemId,
          currentPublishedVersionId: null,
        },
        data: { status: 'IN_REVIEW', updatedBy: input.submittedBy },
      });
      await this.markFileVersionReviewing(tx, version.fileVersionId);
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
    if (input.decision === 'REJECTED') {
      const version = await tx.standardVersion.update({
        where: { id: input.sourceId },
        data: { status: 'REJECTED', revision: { increment: 1 } },
        select: { fileVersionId: true, standardId: true },
      });
      await tx.standard.updateMany({
        where: { id: version.standardId, currentPublishedVersionId: null },
        data: { status: 'REJECTED', updatedBy: input.actorUserId },
      });
      await this.applyGenericFileVersionDecision(
        tx,
        version.fileVersionId,
        input.decision,
        input.decidedAt,
      );
      return;
    }
    const version = await tx.standardVersion.update({
      where: { id: input.sourceId },
      data: {
        status: 'PUBLISHED',
        publishedAt: input.decidedAt,
        revision: { increment: 1 },
      },
      select: {
        standardId: true,
        fileVersionId: true,
        effectiveAt: true,
      },
    });
    await tx.standard.update({
      where: { id: version.standardId },
      data: {
        status: 'PUBLISHED',
        currentPublishedVersionId: input.sourceId,
        effectiveAt: version.effectiveAt,
        updatedBy: input.actorUserId,
      },
    });
    await this.applyGenericFileVersionDecision(
      tx,
      version.fileVersionId,
      input.decision,
      input.decidedAt,
    );
  }

  private async applyKnowledgeDecision(
    tx: Prisma.TransactionClient,
    input: ReviewBusinessDecisionInput,
  ): Promise<void> {
    if (input.decision === 'REJECTED') {
      const version = await tx.knowledgeVersion.update({
        where: { id: input.sourceId },
        data: { status: 'REJECTED', revision: { increment: 1 } },
        select: { fileVersionId: true, knowledgeItemId: true },
      });
      await tx.knowledgeItem.updateMany({
        where: {
          id: version.knowledgeItemId,
          currentPublishedVersionId: null,
        },
        data: { status: 'REJECTED', updatedBy: input.actorUserId },
      });
      await this.applyGenericFileVersionDecision(
        tx,
        version.fileVersionId,
        input.decision,
        input.decidedAt,
      );
      return;
    }
    const version = await tx.knowledgeVersion.update({
      where: { id: input.sourceId },
      data: {
        status: 'PUBLISHED',
        publishedAt: input.decidedAt,
        revision: { increment: 1 },
      },
      select: {
        knowledgeItemId: true,
        fileVersionId: true,
        contentType: true,
      },
    });
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
    await this.applyGenericFileVersionDecision(
      tx,
      version.fileVersionId,
      input.decision,
      input.decidedAt,
    );
  }

  private async markFileVersionReviewing(
    tx: Prisma.TransactionClient,
    fileVersionId: string | null,
  ): Promise<void> {
    if (!fileVersionId) return;
    await tx.fileVersion.update({
      where: { id: fileVersionId },
      data: { status: 'REVIEWING' },
    });
  }

  private async applyGenericFileVersionDecision(
    tx: Prisma.TransactionClient,
    fileVersionId: string | null,
    decision: 'APPROVED' | 'REJECTED',
    decidedAt: Date,
  ): Promise<void> {
    if (!fileVersionId) return;
    const version = await tx.fileVersion.update({
      where: { id: fileVersionId },
      data:
        decision === 'APPROVED'
          ? { status: 'APPROVED', approvedAt: decidedAt }
          : { status: 'REJECTED' },
      select: { logicalFileId: true },
    });
    if (decision === 'APPROVED') {
      await tx.logicalFile.update({
        where: { id: version.logicalFileId },
        data: { currentVersionId: fileVersionId, status: 'APPROVED' },
      });
    }
  }
}
