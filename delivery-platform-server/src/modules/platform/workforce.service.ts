import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { OperationLogService } from '../operation-log/operation-log.service';

import {
  AssessSkillDto,
  QueryPlatformDto,
  TrainingParticipantDto,
  UpsertSkillDto,
  UpsertTrainingDto,
} from './dto/platform.dto';

@Injectable()
export class WorkforceService {
  constructor(
    private readonly prisma: PrismaService,
    _operationLog?: OperationLogService,
  ) {}

  async findSkills(query: QueryPlatformDto) {
    const { page = 1, pageSize = 20, keyword, status } = query;
    const where: Prisma.SkillDefinitionWhereInput = {
      ...(keyword && {
        OR: [
          { skillCode: { contains: keyword } },
          { skillName: { contains: keyword } },
          { category: { contains: keyword } },
        ],
      }),
      ...(status && { status }),
    };
    const [total, list] = await Promise.all([
      this.prisma.skillDefinition.count({ where }),
      this.prisma.skillDefinition.findMany({
        where,
        include: {
          assessments: {
            include: {
              user: { select: { id: true, realName: true } },
              assessor: { select: { id: true, realName: true } },
            },
            orderBy: { period: 'desc' },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ category: 'asc' }, { skillName: 'asc' }],
      }),
    ]);
    return {
      list,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async upsertSkill(dto: UpsertSkillDto) {
    return this.prisma.skillDefinition.upsert({
      where: { skillCode: dto.skillCode },
      create: {
        skillCode: dto.skillCode,
        skillName: dto.skillName,
        category: dto.category,
        description: dto.description,
        maxLevel: dto.maxLevel ?? 5,
      },
      update: {
        skillName: dto.skillName,
        category: dto.category,
        description: dto.description,
        maxLevel: dto.maxLevel,
        status: 'Active',
      },
    });
  }

  async assessSkill(dto: AssessSkillDto, assessorId: string) {
    const skill = await this.prisma.skillDefinition.findUnique({
      where: { id: dto.skillId },
      select: { maxLevel: true },
    });
    if (!skill) {
      throw new NotFoundException('技能项不存在');
    }
    const level = Math.min(dto.level, skill.maxLevel);
    const finalScore = dto.managerScore ?? dto.selfScore ?? null;
    return this.prisma.skillAssessment.upsert({
      where: {
        skillId_userId_period: {
          skillId: dto.skillId,
          userId: dto.userId,
          period: dto.period,
        },
      },
      create: {
        skillId: dto.skillId,
        userId: dto.userId,
        assessorId,
        level,
        selfScore: dto.selfScore,
        managerScore: dto.managerScore,
        finalScore,
        period: dto.period,
        evidenceNote: dto.evidenceNote,
      },
      update: {
        assessorId,
        level,
        selfScore: dto.selfScore,
        managerScore: dto.managerScore,
        finalScore,
        evidenceNote: dto.evidenceNote,
      },
    });
  }

  async findTraining(query: QueryPlatformDto) {
    const { page = 1, pageSize = 20, keyword, status } = query;
    const where: Prisma.TrainingPlanWhereInput = {
      ...(keyword && {
        OR: [{ title: { contains: keyword } }, { category: { contains: keyword } }],
      }),
      ...(status && { status }),
    };
    const [total, list] = await Promise.all([
      this.prisma.trainingPlan.count({ where }),
      this.prisma.trainingPlan.findMany({
        where,
        include: {
          trainer: {
            select: { id: true, realName: true, username: true },
          },
          participants: {
            include: {
              user: { select: { id: true, realName: true, username: true } },
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { startAt: 'desc' },
      }),
    ]);
    const attachments = list.length
      ? await this.prisma.attachment.findMany({
          where: {
            ownerType: 'TrainingPlan',
            ownerId: { in: list.map((item) => item.id) },
            deletedAt: null,
          },
          select: {
            id: true,
            ownerId: true,
            category: true,
            originalName: true,
            fileExt: true,
            fileSize: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    return {
      list: list.map((item) => ({
        ...item,
        attachments: attachments
          .filter((attachment) => attachment.ownerId === item.id)
          .map((attachment) => ({
            ...attachment,
            fileSize: attachment.fileSize.toString(),
          })),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createTraining(dto: UpsertTrainingDto) {
    return this.prisma.trainingPlan.create({
      data: {
        title: dto.title,
        category: dto.category,
        trainerName: dto.trainerName,
        trainerId: dto.trainerId,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        location: dto.location,
        status: dto.status ?? 'Planned',
        description: dto.description,
      },
    });
  }

  async updateTraining(id: string, dto: UpsertTrainingDto) {
    const training = await this.prisma.trainingPlan.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!training) {
      throw new NotFoundException('培训计划不存在');
    }
    return this.prisma.trainingPlan.update({
      where: { id },
      data: {
        title: dto.title,
        category: dto.category,
        trainerName: dto.trainerName,
        trainerId: dto.trainerId,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : null,
        location: dto.location,
        status: dto.status,
        description: dto.description,
      },
    });
  }

  async completeTraining(id: string) {
    const training = await this.prisma.trainingPlan.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!training) {
      throw new NotFoundException('培训计划不存在');
    }
    const completedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.trainingParticipant.updateMany({
        where: { trainingId: id, attendance: 'Attended' },
        data: { completedAt },
      });
      return tx.trainingPlan.update({
        where: { id },
        data: { status: 'Completed' },
      });
    });
  }

  async addTrainingParticipant(trainingId: string, dto: TrainingParticipantDto) {
    const training = await this.prisma.trainingPlan.findUnique({
      where: { id: trainingId },
      select: { id: true },
    });
    if (!training) {
      throw new NotFoundException('培训计划不存在');
    }
    return this.prisma.trainingParticipant.upsert({
      where: { trainingId_userId: { trainingId, userId: dto.userId } },
      create: {
        trainingId,
        userId: dto.userId,
        attendance: dto.attendance ?? 'Invited',
        score: dto.score,
      },
      update: { attendance: dto.attendance, score: dto.score },
    });
  }

  async signTraining(trainingId: string, userId: string) {
    const participant = await this.prisma.trainingParticipant.findUnique({
      where: { trainingId_userId: { trainingId, userId } },
    });
    if (!participant) {
      throw new NotFoundException('当前用户不在培训参与名单中');
    }
    return this.prisma.trainingParticipant.update({
      where: { id: participant.id },
      data: { attendance: 'Attended', signedAt: new Date() },
    });
  }
}
