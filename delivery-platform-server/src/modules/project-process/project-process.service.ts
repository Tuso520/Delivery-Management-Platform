import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ProjectAccessService } from '../project/project-access.service';

import {
  CreateProjectProcessDto,
  QueryProjectProcessDto,
  UpdateProjectProcessDto,
} from './dto/project-process.dto';

@Injectable()
export class ProjectProcessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async findAll(query: QueryProjectProcessDto, userId: string) {
    const { page = 1, pageSize = 20, projectId, recordType, keyword } = query;
    const where: Prisma.ProjectProcessRecordWhereInput = {
      deletedAt: null,
      project: await this.projectAccess.buildProjectWhere(userId),
      projectId,
      recordType,
      ...(keyword && {
        OR: [
          { title: { contains: keyword } },
          { description: { contains: keyword } },
        ],
      }),
    };
    const [total, list] = await Promise.all([
      this.prisma.projectProcessRecord.count({ where }),
      this.prisma.projectProcessRecord.findMany({
        where,
        include: {
          project: {
            select: { id: true, projectCode: true, projectName: true },
          },
          creator: { select: { id: true, realName: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ recordDate: 'desc' }, { createdAt: 'desc' }],
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

  async findById(id: string, userId: string) {
    const record = await this.prisma.projectProcessRecord.findFirst({
      where: { id, deletedAt: null },
      include: {
        project: {
          select: { id: true, projectCode: true, projectName: true },
        },
        creator: { select: { id: true, realName: true } },
      },
    });
    if (!record) throw new NotFoundException('项目过程记录不存在');
    await this.projectAccess.assertProjectAccess(record.projectId, userId);
    return record;
  }

  async create(dto: CreateProjectProcessDto, userId: string) {
    await this.projectAccess.assertProjectAccess(dto.projectId, userId);
    return this.prisma.projectProcessRecord.create({
      data: {
        projectId: dto.projectId,
        title: dto.title,
        recordType: dto.recordType,
        stageCode: dto.stageCode,
        recordDate: new Date(dto.recordDate),
        description: dto.description,
        createdBy: userId,
      },
      include: {
        project: {
          select: { id: true, projectCode: true, projectName: true },
        },
        creator: { select: { id: true, realName: true } },
      },
    });
  }

  async update(id: string, dto: UpdateProjectProcessDto, userId: string) {
    await this.findById(id, userId);
    return this.prisma.projectProcessRecord.update({
      where: { id },
      data: {
        title: dto.title,
        recordType: dto.recordType,
        stageCode: dto.stageCode,
        recordDate: dto.recordDate ? new Date(dto.recordDate) : undefined,
        description: dto.description,
      },
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findById(id, userId);
    await this.prisma.projectProcessRecord.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
