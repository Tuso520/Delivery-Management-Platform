import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import type { CreateReviewTaskStepInput, ReviewMode } from './review-task.service';
import { ReviewerEligibilityService } from './reviewer-eligibility.service';

export interface ResolvedReviewConfiguration {
  approvalTemplateId: string;
  approvalTemplateVersion: string;
  snapshot: Prisma.InputJsonObject;
  reviewMode: ReviewMode;
  steps: CreateReviewTaskStepInput[];
}

@Injectable()
export class ReviewConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewerEligibility: ReviewerEligibilityService,
  ) {}

  async resolve(
    approvalTemplateId: string | null | undefined,
    submitterId: string,
    projectId?: string,
  ): Promise<ResolvedReviewConfiguration> {
    if (!approvalTemplateId) {
      throw new UnprocessableEntityException('要求审核，但未配置审批模板');
    }
    const template = await this.prisma.approvalTemplate.findFirst({
      where: { id: approvalTemplateId, isEnabled: true },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!template || template.steps.length === 0) {
      throw new UnprocessableEntityException('审批模板不存在、已停用或没有步骤');
    }

    const steps: CreateReviewTaskStepInput[] = [];
    for (const step of template.steps) {
      const configuredValues = this.approverValues(step.approverValues);
      const candidateIds = Array.from(
        new Set(
          (
            await Promise.all(
              configuredValues.map((value) =>
                step.approverType === 'user'
                  ? Promise.resolve([value])
                  : this.findRoleReviewerCandidates(value),
              ),
            )
          ).flat(),
        ),
      );
      const resolvedUserIds: string[] = [];
      for (const candidateId of candidateIds) {
        const eligible = projectId
          ? await this.reviewerEligibility.isEligible(candidateId, projectId, submitterId)
          : await this.reviewerEligibility.isEligibleUser(candidateId, submitterId);
        if (eligible) resolvedUserIds.push(candidateId);
      }
      if (resolvedUserIds.length === 0) {
        throw new UnprocessableEntityException(
          `审批步骤“${step.stepName}”未找到具备审核权限和数据范围的审核人`,
        );
      }
      if (step.mode === 'SINGLE' && resolvedUserIds.length !== 1) {
        throw new UnprocessableEntityException(
          `审批步骤“${step.stepName}”的单人审批对象解析出多名审核人`,
        );
      }
      if (step.requiredCount > resolvedUserIds.length) {
        throw new UnprocessableEntityException(
          `审批步骤“${step.stepName}”的有效审核人数不足`,
        );
      }
      steps.push({
        mode: step.mode as ReviewMode,
        requiredCount: step.requiredCount,
        assigneeUserIds: resolvedUserIds,
        resolvedFromType: step.approverType,
        resolvedFromValue: configuredValues.join(','),
      });
    }

    const approvalTemplateVersion = template.updatedAt.toISOString();
    return {
      approvalTemplateId: template.id,
      approvalTemplateVersion,
      reviewMode:
        steps.length > 1
          ? steps.every((step) => step.mode === 'SINGLE')
            ? 'SERIAL'
            : 'PARALLEL'
          : steps[0].mode,
      steps,
      snapshot: {
        id: template.id,
        code: template.templateCode,
        name: template.templateName,
        version: approvalTemplateVersion,
        steps: template.steps.map((step, index) => ({
          stepNo: index + 1,
          stepName: step.stepName,
          approverType: step.approverType,
          mode: step.mode,
          requiredCount: step.requiredCount,
          approverValues: this.approverValues(step.approverValues),
          assigneeUserIds: steps[index].assigneeUserIds,
        })),
      },
    };
  }

  private approverValues(value: Prisma.JsonValue): string[] {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      throw new UnprocessableEntityException('审批步骤的审批对象配置无效');
    }
    return value.map((entry) => (entry as string).trim()).filter(Boolean);
  }

  private async findRoleReviewerCandidates(roleCode: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'Active',
        userRoles: {
          some: {
            role: {
              roleCode,
              status: 'Active',
              rolePermissions: {
                some: {
                  permission: {
                    permissionCode: 'file_review:act',
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((user) => user.id);
  }
}
