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
}
