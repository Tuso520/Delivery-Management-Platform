import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ProjectAccessService } from '../project/project-access.service';

export const REVIEW_ACTION_PERMISSION_CODES = ['file_review:act'] as const;

export interface ReviewerCandidate {
  id: string;
  username: string;
  realName: string;
  departmentName: string | null;
}

export interface ResolveReviewerInput {
  projectId: string;
  uploaderId: string;
  explicitReviewerId?: string | null;
  responsibleUserId?: string | null;
}

@Injectable()
export class ReviewerEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async isEligible(userId: string, projectId: string, uploaderId?: string): Promise<boolean> {
    if (!(await this.isEligibleUser(userId, uploaderId))) return false;

    return this.hasProjectAccess(projectId, userId);
  }

  async isEligibleUser(userId: string, excludedUserId?: string): Promise<boolean> {
    if (excludedUserId && userId === excludedUserId) return false;
    const user = await this.prisma.user.findFirst({
      where: this.buildEligibleUserWhere({ id: userId }),
      select: { id: true },
    });
    return Boolean(user);
  }

  async assertEligibleForReview(
    userId: string,
    projectId?: string,
    excludedUserId?: string,
  ): Promise<void> {
    const eligible = projectId
      ? await this.isEligible(userId, projectId, excludedUserId)
      : await this.isEligibleUser(userId, excludedUserId);
    if (!eligible) {
      throw new ForbiddenException('当前用户不具备该文件审核资格');
    }
  }

  async assertEligible(userId: string, projectId: string, uploaderId?: string): Promise<void> {
    if (!(await this.isEligible(userId, projectId, uploaderId))) {
      throw new ForbiddenException('当前用户不具备该项目的文件审核资格');
    }
  }

  async findEligibleReviewers(
    projectId?: string,
    excludedUserId?: string,
  ): Promise<ReviewerCandidate[]> {
    const users = await this.prisma.user.findMany({
      where: this.buildEligibleUserWhere(
        excludedUserId ? { id: { not: excludedUserId } } : undefined,
      ),
      select: {
        id: true,
        username: true,
        realName: true,
        department: { select: { departmentName: true } },
      },
      orderBy: [{ realName: 'asc' }, { username: 'asc' }],
    });

    const scopedUsers = projectId
      ? (
          await Promise.all(
            users.map(async (user) => ({
              user,
              accessible: await this.hasProjectAccess(projectId, user.id),
            })),
          )
        )
          .filter(({ accessible }) => accessible)
          .map(({ user }) => user)
      : users;

    return scopedUsers.map((user) => ({
      id: user.id,
      username: user.username,
      realName: user.realName,
      departmentName: user.department?.departmentName ?? null,
    }));
  }

  async resolveReviewer(input: ResolveReviewerInput): Promise<string> {
    const preferredCandidateIds = [input.explicitReviewerId, input.responsibleUserId].filter(
      (value): value is string => Boolean(value),
    );

    for (const candidateId of new Set(preferredCandidateIds)) {
      if (await this.isEligible(candidateId, input.projectId, input.uploaderId)) {
        return candidateId;
      }
    }

    const [fallback] = await this.findEligibleReviewers(input.projectId, input.uploaderId);
    if (fallback) return fallback.id;

    throw new UnprocessableEntityException(
      '档案项要求审核，但未找到具备审核权限且可访问该项目的审核人',
    );
  }

  private buildEligibleUserWhere(extra?: Prisma.UserWhereInput): Prisma.UserWhereInput {
    return {
      ...extra,
      deletedAt: null,
      status: UserStatus.Active,
      userRoles: {
        some: {
          role: {
            status: 'Active',
            rolePermissions: {
              some: {
                permission: {
                  permissionCode: {
                    in: [...REVIEW_ACTION_PERMISSION_CODES],
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  private async hasProjectAccess(projectId: string, userId: string): Promise<boolean> {
    try {
      await this.projectAccess.assertProjectAccess(projectId, userId);
      return true;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        return false;
      }
      throw error;
    }
  }
}
