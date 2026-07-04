import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../database/prisma.service';

import { QueryOperationLogDto, CreateOperationLogDto } from './dto/operation-log.dto';

// Use Prisma's generated type for the query result with user include
const operationLogWithUser = Prisma.validator<Prisma.OperationLogDefaultArgs>()({
  include: {
    user: {
      select: {
        id: true,
        username: true,
        realName: true,
      },
    },
  },
});

export type OperationLogWithUser = Prisma.OperationLogGetPayload<typeof operationLogWithUser>;

export interface OperationLogItem {
  id: string;
  userId: string;
  module: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeData: unknown;
  afterData: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  result: string;
  createdAt: Date;
}

export interface OperationLogDetail extends OperationLogItem {
  user: {
    id: string;
    username: string;
    realName: string;
  } | null;
}

@Injectable()
export class OperationLogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryOperationLogDto): Promise<PaginatedResult<OperationLogDetail>> {
    const {
      page = 1,
      pageSize = 20,
      userId,
      module,
      action,
      targetType,
      startDate,
      endDate,
      result,
    } = query;

    const where: Record<string, unknown> = {};

    if (userId) {
      where.userId = userId;
    }

    if (module) {
      where.module = module;
    }

    if (action) {
      where.action = action;
    }

    if (targetType) {
      where.targetType = targetType;
    }

    if (result) {
      where.result = result;
    }

    if (startDate || endDate) {
      const createdAt: Record<string, Date> = {};
      if (startDate) {
        createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        createdAt.lte = new Date(endDate);
      }
      where.createdAt = createdAt;
    }

    const [total, list] = await Promise.all([
      this.prisma.operationLog.count({ where }),
      this.prisma.operationLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              realName: true,
            },
          },
        },
      }),
    ]);

    return {
      list: list as OperationLogWithUser[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(id: string): Promise<OperationLogDetail> {
    const log = await this.prisma.operationLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
      },
    });

    if (!log) {
      throw new NotFoundException('操作日志不存在');
    }

    return log as OperationLogWithUser;
  }

  async log(dto: CreateOperationLogDto): Promise<OperationLogItem> {
    const log = await this.prisma.operationLog.create({
      data: {
        userId: dto.userId,
        module: dto.module,
        action: dto.action,
        targetType: dto.targetType,
        targetId: dto.targetId,
        beforeData:
          dto.beforeData === undefined
            ? Prisma.JsonNull
            : (dto.beforeData as Prisma.InputJsonValue),
        afterData:
          dto.afterData === undefined
            ? Prisma.JsonNull
            : (dto.afterData as Prisma.InputJsonValue),
        ipAddress: dto.ipAddress ?? null,
        userAgent: dto.userAgent ?? null,
        result: dto.result ?? 'success',
      },
    });

    return log;
  }
}
