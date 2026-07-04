import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import {
  QueryPlatformDto,
  RetrospectiveActionDto,
  UpsertRetrospectiveDto,
} from './dto/platform.dto';

@Injectable()
export class RetrospectiveService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryPlatformDto, userId: string) {
    const { page = 1, pageSize = 20, keyword, status } = query;
    const elevated = await this.isElevated(userId);
    const where: Prisma.ProjectRetrospectiveWhereInput = {
      ...(status && { status }),
      ...(keyword && {
        OR: [
          { summary: { contains: keyword } },
          { problemCategory: { contains: keyword } },
          { project: { projectName: { contains: keyword } } },
        ],
      }),
      ...(!elevated && {
        project: {
          deletedAt: null,
          members: { some: { userId } },
        },
      }),
    };
    const [total, list] = await Promise.all([
      this.prisma.projectRetrospective.count({ where }),
      this.prisma.projectRetrospective.findMany({
        where,
        include: {
          project: {
            select: { id: true, projectCode: true, projectName: true },
          },
          actions: {
            include: {
              owner: { select: { id: true, realName: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
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

  async create(dto: UpsertRetrospectiveDto, userId: string) {
    await this.assertProjectAccess(dto.projectId, userId);
    return this.prisma.projectRetrospective.create({
      data: {
        projectId: dto.projectId,
        summary: dto.summary,
        lessonsLearned: dto.lessonsLearned,
        problemCategory: dto.problemCategory,
        status: dto.status ?? 'Draft',
      },
    });
  }

  async update(
    id: string,
    dto: UpsertRetrospectiveDto,
    userId: string,
  ) {
    const retrospective = await this.prisma.projectRetrospective.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });
    if (!retrospective) {
      throw new NotFoundException('项目复盘不存在');
    }
    await this.assertProjectAccess(retrospective.projectId, userId);
    if (dto.status === 'Closed') {
      const openActionCount = await this.prisma.retrospectiveAction.count({
        where: { retrospectiveId: id, status: { not: 'Closed' } },
      });
      if (openActionCount > 0) {
        throw new BadRequestException(
          '仍有未关闭的整改任务，不能关闭项目复盘',
        );
      }
    }
    return this.prisma.projectRetrospective.update({
      where: { id },
      data: {
        projectId: dto.projectId,
        summary: dto.summary,
        lessonsLearned: dto.lessonsLearned,
        problemCategory: dto.problemCategory,
        status: dto.status,
      },
    });
  }

  async addAction(
    retrospectiveId: string,
    dto: RetrospectiveActionDto,
    userId: string,
  ) {
    const retrospective = await this.prisma.projectRetrospective.findUnique({
      where: { id: retrospectiveId },
      select: { projectId: true },
    });
    if (!retrospective) {
      throw new NotFoundException('项目复盘不存在');
    }
    await this.assertProjectAccess(retrospective.projectId, userId);
    return this.prisma.retrospectiveAction.create({
      data: {
        retrospectiveId,
        title: dto.title,
        ownerId: dto.ownerId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status ?? 'Open',
        verificationNote: dto.verificationNote,
      },
    });
  }

  async updateAction(
    id: string,
    dto: RetrospectiveActionDto,
    userId: string,
  ) {
    const action = await this.prisma.retrospectiveAction.findUnique({
      where: { id },
      include: { retrospective: { select: { projectId: true } } },
    });
    if (!action) {
      throw new NotFoundException('整改任务不存在');
    }
    await this.assertProjectAccess(action.retrospective.projectId, userId);
    return this.prisma.retrospectiveAction.update({
      where: { id },
      data: {
        title: dto.title,
        ownerId: dto.ownerId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: dto.status,
        verificationNote: dto.verificationNote,
        closedAt: dto.status === 'Closed' ? new Date() : null,
      },
    });
  }

  private async assertProjectAccess(
    projectId: string,
    userId: string,
  ): Promise<void> {
    if (await this.isElevated(userId)) {
      return;
    }
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new ForbiddenException('没有访问该项目复盘的权限');
    }
  }

  private async isElevated(userId: string): Promise<boolean> {
    return (
      (await this.prisma.userRole.count({
        where: {
          userId,
          role: {
            roleCode: {
              in: ['SUPER_ADMIN', 'DELIVERY_MANAGER', 'COUNTRY_MANAGER'],
            },
          },
        },
      })) > 0
    );
  }
}
