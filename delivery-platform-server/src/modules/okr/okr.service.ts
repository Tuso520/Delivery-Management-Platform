import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ApprovalService } from '../platform/approval.service';

import {
  CreateObjectiveDto,
  UpdateObjectiveDto,
  CreateKeyResultDto,
  UpdateKeyResultDto,
  CreateScoreDto,
  UpdateScoreDto,
} from './dto/okr.dto';

@Injectable()
export class OkrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: ApprovalService,
  ) {}

  // ==================== Objectives ====================

  async createObjective(dto: CreateObjectiveDto, ownerId: string) {
    return this.prisma.okrObjective.create({
      data: {
        title: dto.title,
        description: dto.description,
        period: dto.period,
        periodType: dto.periodType,
        ownerId,
        departmentId: dto.departmentId,
        weight: dto.weight ?? 100,
        goalType: dto.goalType ?? 'OKR',
        scoringFlow: dto.scoringFlow ?? 'Manager',
        scoringMethod: dto.scoringMethod ?? 'Weighted',
        scorerIds: (dto.scorerIds as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        scoringContent:
          (dto.scoringContent as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        calculationRule: dto.calculationRule,
      },
      include: {
        owner: { select: { id: true, realName: true } },
        keyResults: true,
      },
    });
  }

  async findAllObjectives(ownerId?: string, period?: string) {
    const where: Record<string, unknown> = {};

    if (ownerId) {
      where.ownerId = ownerId;
    }
    if (period) {
      where.period = period;
    }

    return this.prisma.okrObjective.findMany({
      where,
      include: {
        owner: { select: { id: true, realName: true } },
        keyResults: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findObjectiveById(id: string) {
    const obj = await this.prisma.okrObjective.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, realName: true } },
        keyResults: { orderBy: { createdAt: 'asc' } },
        scores: {
          include: { scorer: { select: { id: true, realName: true } } },
          orderBy: { month: 'desc' },
        },
      },
    });

    if (!obj) {
      throw new NotFoundException('OKR 目标不存在');
    }

    return obj;
  }

  async updateObjective(id: string, dto: UpdateObjectiveDto, userId: string) {
    const obj = await this.prisma.okrObjective.findUnique({ where: { id } });

    if (!obj) {
      throw new NotFoundException('OKR 目标不存在');
    }

    if (obj.ownerId !== userId) {
      throw new ForbiddenException('只能编辑自己的 OKR');
    }

    return this.prisma.okrObjective.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.period !== undefined && { period: dto.period }),
        ...(dto.periodType !== undefined && { periodType: dto.periodType }),
        ...(dto.departmentId !== undefined && {
          departmentId: dto.departmentId,
        }),
        ...(dto.weight !== undefined && { weight: dto.weight }),
        ...(dto.progress !== undefined && { progress: dto.progress }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.goalType !== undefined && { goalType: dto.goalType }),
        ...(dto.scoringFlow !== undefined && {
          scoringFlow: dto.scoringFlow,
        }),
        ...(dto.scoringMethod !== undefined && {
          scoringMethod: dto.scoringMethod,
        }),
        ...(dto.scorerIds !== undefined && {
          scorerIds: dto.scorerIds as Prisma.InputJsonValue,
        }),
        ...(dto.scoringContent !== undefined && {
          scoringContent: dto.scoringContent as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.calculationRule !== undefined && {
          calculationRule: dto.calculationRule,
        }),
      },
      include: {
        owner: { select: { id: true, realName: true } },
        keyResults: true,
      },
    });
  }

  async deleteObjective(id: string, userId: string): Promise<void> {
    const obj = await this.prisma.okrObjective.findUnique({ where: { id } });

    if (!obj) {
      throw new NotFoundException('OKR 目标不存在');
    }

    if (obj.ownerId !== userId) {
      throw new ForbiddenException('只能删除自己的 OKR');
    }

    await this.prisma.okrObjective.delete({ where: { id } });
  }

  async getMyObjectives(userId: string) {
    return this.prisma.okrObjective.findMany({
      where: { ownerId: userId },
      include: {
        keyResults: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==================== Key Results ====================

  async createKeyResult(objectiveId: string, dto: CreateKeyResultDto, userId: string) {
    const obj = await this.prisma.okrObjective.findUnique({ where: { id: objectiveId } });

    if (!obj) {
      throw new NotFoundException('OKR 目标不存在');
    }

    if (obj.ownerId !== userId) {
      throw new ForbiddenException('只能给自己的 OKR 添加关键结果');
    }

    return this.prisma.keyResult.create({
      data: {
        objectiveId,
        title: dto.title,
        targetValue: dto.targetValue,
        currentValue: dto.currentValue,
        weight: dto.weight ?? 100,
      },
    });
  }

  async updateKeyResult(krId: string, dto: UpdateKeyResultDto, userId: string) {
    const kr = await this.prisma.keyResult.findUnique({
      where: { id: krId },
      include: { objective: true },
    });

    if (!kr) {
      throw new NotFoundException('关键结果不存在');
    }

    if (kr.objective.ownerId !== userId) {
      throw new ForbiddenException('无权限修改此关键结果');
    }

    return this.prisma.keyResult.update({
      where: { id: krId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.targetValue !== undefined && { targetValue: dto.targetValue }),
        ...(dto.currentValue !== undefined && { currentValue: dto.currentValue }),
        ...(dto.weight !== undefined && { weight: dto.weight }),
        ...(dto.progress !== undefined && { progress: dto.progress }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
  }

  async deleteKeyResult(krId: string, userId: string): Promise<void> {
    const kr = await this.prisma.keyResult.findUnique({
      where: { id: krId },
      include: { objective: true },
    });

    if (!kr) {
      throw new NotFoundException('关键结果不存在');
    }

    if (kr.objective.ownerId !== userId) {
      throw new ForbiddenException('无权限删除此关键结果');
    }

    await this.prisma.keyResult.delete({ where: { id: krId } });
  }

  // ==================== Performance Scores ====================

  async createScore(objectiveId: string, dto: CreateScoreDto, userId: string) {
    // Check for existing score for same objective+month
    const existing = await this.prisma.performanceScore.findUnique({
      where: {
        objectiveId_month_scorerId: {
          objectiveId,
          month: dto.month,
          scorerId: userId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('该月份已有自评记录，请使用更新');
    }

    return this.prisma.performanceScore.create({
      data: {
        objectiveId,
        scorerId: userId,
        month: dto.month,
        selfScore: dto.selfScore,
        projectRatio: dto.projectRatio,
        comment: dto.comment,
        status: 'Submitted',
      },
      include: {
        scorer: { select: { id: true, realName: true } },
      },
    });
  }

  async updateScore(scoreId: string, dto: UpdateScoreDto, userId: string) {
    const score = await this.prisma.performanceScore.findUnique({
      where: { id: scoreId },
      include: { objective: true },
    });

    if (!score) {
      throw new NotFoundException('评分记录不存在');
    }

    if (
      (dto.selfScore !== undefined || dto.projectRatio !== undefined) &&
      score.scorerId !== userId
    ) {
      throw new ForbiddenException('只能修改自己的绩效自评');
    }

    return this.prisma.performanceScore.update({
      where: { id: scoreId },
      data: {
        ...(dto.selfScore !== undefined && { selfScore: dto.selfScore }),
        ...(dto.projectRatio !== undefined && { projectRatio: dto.projectRatio }),
        ...(dto.managerScore !== undefined && { managerScore: dto.managerScore }),
        ...(dto.nextGoal !== undefined && { nextGoal: dto.nextGoal }),
        ...(dto.comment !== undefined && { comment: dto.comment }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: {
        scorer: { select: { id: true, realName: true } },
      },
    });
  }

  async submitScore(scoreId: string, dto: UpdateScoreDto, userId: string) {
    const score = await this.prisma.performanceScore.findUnique({
      where: { id: scoreId },
      include: {
        objective: {
          select: { title: true, scorerIds: true },
        },
      },
    });
    if (!score) {
      throw new NotFoundException('评分记录不存在');
    }
    if (score.status === 'Reviewing' || score.status === 'Completed') {
      throw new ConflictException('该评分已提交或完成');
    }
    if (dto.managerScore === undefined) {
      throw new ConflictException('提交审批前必须填写主管评分');
    }

    await this.prisma.performanceScore.update({
      where: { id: scoreId },
      data: {
        managerScore: dto.managerScore,
        nextGoal: dto.nextGoal,
        comment: dto.comment,
      },
    });
    const scorerIds = Array.isArray(score.objective.scorerIds)
      ? score.objective.scorerIds.filter((value): value is string => typeof value === 'string')
      : [];
    return this.approvalService.startBusinessApproval({
      businessType: 'performance',
      businessId: score.id,
      businessTitle: `${score.month} ${score.objective.title}绩效评分`,
      applicantId: userId,
      approverIds: scorerIds.length > 0 ? scorerIds : undefined,
    });
  }

  async getTeamObjectives(_userId: string) {
    // Get all users in same department as this user (simplified: supervisor views all)
    // In a real system, this would filter by supervision hierarchy
    return this.prisma.okrObjective.findMany({
      include: {
        owner: { select: { id: true, realName: true } },
        keyResults: { orderBy: { createdAt: 'asc' } },
        scores: {
          include: { scorer: { select: { id: true, realName: true } } },
          orderBy: { month: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ period: 'desc' }, { ownerId: 'asc' }],
      take: 50,
    });
  }
}
