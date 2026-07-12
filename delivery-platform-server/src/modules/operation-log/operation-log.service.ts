import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { getCurrentTraceId } from '../../common/utils/request-trace.util';
import { PrismaService } from '../../database/prisma.service';

import { QueryOperationLogDto, CreateOperationLogDto } from './dto/operation-log.dto';

type OperationLogClient = Pick<Prisma.TransactionClient, 'operationLog'>;

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
  traceId: string | null;
  errorReason: string | null;
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
      keyword,
      startDate,
      endDate,
      result,
      traceId,
    } = query;

    const where: Prisma.OperationLogWhereInput = {};

    if (keyword) {
      where.OR = [
        { module: { contains: keyword } },
        { action: { contains: keyword } },
        { targetType: { contains: keyword } },
        { targetId: { contains: keyword } },
        { traceId: { contains: keyword } },
      ];
    }

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

    if (traceId) {
      where.traceId = traceId;
    }

    if (startDate || endDate) {
      const createdAt: Prisma.DateTimeFilter = {};
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
      items: list.map((log) => this.toSafeLog(log)),
      page,
      pageSize,
      total,
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
      throw new NotFoundException('审计日志不存在');
    }

    return this.toSafeLog(log);
  }

  async log(
    dto: CreateOperationLogDto,
    client: OperationLogClient = this.prisma,
  ): Promise<OperationLogItem> {
    const log = await client.operationLog.create({
      data: {
        userId: dto.userId,
        module: dto.module,
        action: dto.action,
        targetType: dto.targetType,
        targetId: dto.targetId,
        beforeData: this.toSafeInputJson(dto.beforeData),
        afterData: this.toSafeInputJson(dto.afterData),
        ipAddress: dto.ipAddress ?? null,
        userAgent: dto.userAgent ?? null,
        result: dto.result ?? 'success',
        traceId: dto.traceId ?? getCurrentTraceId() ?? randomUUID(),
        errorReason: this.redactErrorReason(dto.errorReason),
      },
    });

    return this.toSafeLog(log);
  }

  private toSafeLog(log: OperationLogWithUser): OperationLogDetail;
  private toSafeLog(log: OperationLogItem): OperationLogItem;
  private toSafeLog(
    log: OperationLogWithUser | OperationLogItem,
  ): OperationLogDetail | OperationLogItem {
    return {
      ...log,
      beforeData: this.redactJson(log.beforeData),
      afterData: this.redactJson(log.afterData),
      errorReason: this.redactErrorReason(log.errorReason),
    };
  }

  private redactJson(value: unknown, key?: string): unknown {
    if (key && this.isSensitiveKey(key)) return '[REDACTED]';
    if (Array.isArray(value)) {
      return value.map((item) => this.redactJson(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([itemKey, item]) => [
          itemKey,
          this.redactJson(item, itemKey),
        ]),
      );
    }
    return value;
  }

  private toSafeInputJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined) return Prisma.JsonNull;
    const normalized = this.normalizeInputJson(this.redactJson(value));
    return normalized === null ? Prisma.JsonNull : normalized;
  }

  private normalizeInputJson(value: unknown): Prisma.InputJsonValue | null {
    if (value === null) return null;
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeInputJson(item));
    }
    if (value && typeof value === 'object') {
      const result: Record<string, Prisma.InputJsonValue | null> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        result[key] = item === undefined ? null : this.normalizeInputJson(item);
      }
      return result as Prisma.InputJsonObject;
    }
    return String(value);
  }

  private isSensitiveKey(key: string): boolean {
    return /password|passphrase|secret|token|api.?key|access.?key|private.?key|encrypt.?key|webhook.?url|authorization|cookie|credential/i.test(
      key,
    );
  }

  private redactErrorReason(value?: string | null): string | null {
    if (!value) return null;
    return value
      .replace(
        /(password|passphrase|secret|token|api.?key|access.?key|authorization|cookie|credential)\s*[=:]\s*[^\s,;]+/gi,
        '$1=[REDACTED]',
      )
      .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
      .slice(0, 1000);
  }
}
