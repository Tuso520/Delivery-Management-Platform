import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class ApprovalBusinessService {
  async applySubmissionState(
    tx: Prisma.TransactionClient,
    businessType: string,
    businessId: string,
  ): Promise<void> {
    if (businessType === 'report') {
      await tx.dailyReport.update({
        where: { id: businessId },
        data: { status: 'Submitted' },
      });
    } else if (businessType === 'knowledge') {
      await tx.knowledgeArticle.update({
        where: { id: businessId },
        data: { status: 'Reviewing' },
      });
    } else if (businessType === 'template') {
      await tx.documentTemplate.update({
        where: { id: businessId },
        data: { status: 'Reviewing' },
      });
    } else if (businessType === 'checklist') {
      await tx.projectChecklistItem.update({
        where: { id: businessId },
        data: { status: 'Submitted', submittedAt: new Date() },
      });
    } else if (businessType === 'performance') {
      await tx.performanceScore.update({
        where: { id: businessId },
        data: { status: 'Reviewing' },
      });
    }
  }

  async applyDecisionState(
    tx: Prisma.TransactionClient,
    businessType: string,
    businessId: string,
    decision: string,
    reviewerId: string,
    comment?: string,
  ): Promise<void> {
    const approved = decision === 'Approved';
    const now = new Date();
    if (businessType === 'report') {
      await tx.dailyReport.update({
        where: { id: businessId },
        data: approved
          ? { status: 'Reviewed', reviewedBy: reviewerId, reviewedAt: now }
          : { status: 'Draft', reviewedBy: reviewerId, reviewedAt: now },
      });
    } else if (businessType === 'knowledge') {
      await this.applyKnowledgeDecision(
        tx,
        businessId,
        approved,
        reviewerId,
        now,
      );
    } else if (businessType === 'knowledge-file-update') {
      await this.applyKnowledgeFileUpdateDecision(
        tx,
        businessId,
        approved,
        reviewerId,
        now,
        comment,
      );
    } else if (businessType === 'template') {
      await tx.documentTemplate.update({
        where: { id: businessId },
        data: approved
          ? { status: 'Published', reviewerId, publishedAt: now }
          : { status: 'Draft', reviewerId },
      });
    } else if (businessType === 'checklist') {
      await tx.projectChecklistItem.update({
        where: { id: businessId },
        data: {
          status: approved ? 'Approved' : 'Rejected',
          reviewUserId: reviewerId,
          reviewComment: comment,
          reviewedAt: now,
          completedAt: approved ? now : null,
        },
      });
    } else if (businessType === 'performance') {
      await tx.performanceScore.update({
        where: { id: businessId },
        data: { status: approved ? 'Completed' : 'Submitted' },
      });
    }
  }

  private async applyKnowledgeDecision(
    tx: Prisma.TransactionClient,
    articleId: string,
    approved: boolean,
    reviewerId: string,
    publishedAt: Date,
  ): Promise<void> {
    if (!approved) {
      await tx.knowledgeArticle.update({
        where: { id: articleId },
        data: { status: 'Draft', reviewerId },
      });
      return;
    }

    const article = await tx.knowledgeArticle.findUnique({
      where: { id: articleId },
      select: {
        version: true,
        markdownContent: true,
        authorId: true,
      },
    });
    if (!article) {
      throw new NotFoundException('知识文章不存在');
    }
    const currentVersion = Number.parseFloat(article.version.replace('V', ''));
    const nextVersion = `V${((Number.isFinite(currentVersion) ? currentVersion : 1) + 0.1).toFixed(1)}`;
    await tx.knowledgeArticleVersion.upsert({
      where: {
        articleId_version: {
          articleId,
          version: nextVersion,
        },
      },
      create: {
        articleId,
        version: nextVersion,
        markdownContent: article.markdownContent,
        changeNotes: '审批通过发布',
        createdBy: article.authorId,
      },
      update: {
        markdownContent: article.markdownContent,
        changeNotes: '审批通过发布',
      },
    });
    await tx.knowledgeArticle.update({
      where: { id: articleId },
      data: {
        status: 'Published',
        version: nextVersion,
        reviewerId,
        publishedAt,
      },
    });
  }

  private async applyKnowledgeFileUpdateDecision(
    tx: Prisma.TransactionClient,
    revisionAttachmentId: string,
    approved: boolean,
    reviewerId: string,
    decidedAt: Date,
    comment?: string,
  ): Promise<void> {
    const revision = await tx.attachment.findFirst({
      where: {
        id: revisionAttachmentId,
        ownerType: 'KnowledgeFileRevision',
        deletedAt: null,
      },
    });
    if (!revision) {
      throw new NotFoundException('知识库文件更新申请不存在');
    }

    const payload = this.parseRevisionPayload(revision.remark);
    const originalAttachmentId = payload.originalAttachmentId ?? revision.ownerId;
    const original = await tx.attachment.findFirst({
      where: {
        id: originalAttachmentId,
        ownerType: 'KnowledgeArticle',
        deletedAt: null,
      },
    });
    if (!original) {
      throw new NotFoundException('原知识库文件不存在');
    }

    const articleId = payload.articleId ?? original.ownerId;
    if (!approved) {
      await tx.attachment.update({
        where: { id: revisionAttachmentId },
        data: {
          deletedAt: decidedAt,
          remark: this.stringifyRevisionRemark({
            ...payload,
            decision: 'Rejected',
            reviewerId,
            comment,
            decidedAt: decidedAt.toISOString(),
          }),
        },
      });
      return;
    }

    await tx.attachment.update({
      where: { id: originalAttachmentId },
      data: {
        deletedAt: decidedAt,
        remark: this.stringifyRevisionRemark({
          archivedByRevisionId: revisionAttachmentId,
          archivedAt: decidedAt.toISOString(),
        }),
      },
    });
    await tx.attachment.update({
      where: { id: revisionAttachmentId },
      data: {
        ownerType: 'KnowledgeArticle',
        ownerId: articleId,
        category: original.category ?? 'document',
        remark: this.stringifyRevisionRemark({
          ...payload,
          decision: 'Approved',
          reviewerId,
          originalAttachmentId,
          decidedAt: decidedAt.toISOString(),
        }),
      },
    });

    const article = await tx.knowledgeArticle.findUnique({
      where: { id: articleId },
      select: { version: true, markdownContent: true, authorId: true },
    });
    if (!article) {
      throw new NotFoundException('知识库文章不存在');
    }
    const currentVersion = Number.parseFloat(article.version.replace('V', ''));
    const nextVersion = `V${((Number.isFinite(currentVersion) ? currentVersion : 1) + 0.1).toFixed(1)}`;
    await tx.knowledgeArticleVersion.upsert({
      where: {
        articleId_version: {
          articleId,
          version: nextVersion,
        },
      },
      create: {
        articleId,
        version: nextVersion,
        markdownContent: article.markdownContent,
        changeNotes: `附件更新审批通过：${original.originalName}`,
        createdBy: article.authorId,
      },
      update: {
        markdownContent: article.markdownContent,
        changeNotes: `附件更新审批通过：${original.originalName}`,
      },
    });
    await tx.knowledgeArticle.update({
      where: { id: articleId },
      data: {
        status: 'Published',
        version: nextVersion,
        reviewerId,
        publishedAt: decidedAt,
      },
    });
  }

  private parseRevisionPayload(remark?: string | null): Record<string, string | undefined> {
    if (!remark) return {};
    try {
      const parsed = JSON.parse(remark);
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
      return {};
    }
  }

  private stringifyRevisionRemark(value: Record<string, unknown>): string {
    return JSON.stringify(value).slice(0, 500);
  }
}
