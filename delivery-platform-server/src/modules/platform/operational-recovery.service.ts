import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { AuditRecoveryService } from '../operation-log/audit-recovery.service';

export type FailureKind = 'audit' | 'outbox' | 'file-processing';

@Injectable()
export class OperationalRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditRecovery: AuditRecoveryService,
  ) {}

  async findFailures(limit = 50) {
    const take = Math.max(1, Math.min(limit, 200));
    const [audit, outbox, fileProcessing] = await Promise.all([
      this.prisma.auditFailure.findMany({
        where: { status: { in: ['PENDING', 'PROCESSING', 'DEAD'] } },
        select: {
          id: true,
          traceId: true,
          failureCode: true,
          failureMessage: true,
          status: true,
          attempts: true,
          availableAt: true,
          lastAttemptAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.outboxEvent.findMany({
        where: { OR: [{ status: 'DEAD' }, { attempts: { gt: 0 } }] },
        select: {
          id: true,
          traceId: true,
          eventType: true,
          aggregateType: true,
          aggregateId: true,
          status: true,
          attempts: true,
          lastError: true,
          availableAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.fileProcessingJob.findMany({
        where: { OR: [{ status: 'DEAD' }, { attempts: { gt: 0 } }] },
        select: {
          id: true,
          traceId: true,
          fileAssetId: true,
          type: true,
          status: true,
          progress: true,
          attempts: true,
          errorCode: true,
          errorMessage: true,
          availableAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    ]);
    return { audit, outbox, fileProcessing };
  }

  async retry(kind: FailureKind, id: string) {
    if (kind === 'audit') {
      const retried = await this.auditRecovery.retry(id);
      if (!retried) throw new NotFoundException('审计补偿记录不存在或已恢复');
      return { kind, id, status: 'RESOLVED' };
    }
    if (kind === 'outbox') {
      const updated = await this.prisma.outboxEvent.updateMany({
        where: { id, status: 'DEAD' },
        data: {
          status: 'PENDING',
          attempts: 0,
          availableAt: new Date(),
          lastError: null,
          processedAt: null,
        },
      });
      if (updated.count !== 1) throw new NotFoundException('DEAD Outbox 事件不存在');
      return { kind, id, status: 'PENDING' };
    }
    if (kind === 'file-processing') {
      const updated = await this.prisma.fileProcessingJob.updateMany({
        where: { id, status: 'DEAD' },
        data: {
          status: 'PENDING',
          progress: 0,
          attempts: 0,
          availableAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          errorCode: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        },
      });
      if (updated.count !== 1) throw new NotFoundException('DEAD 文件任务不存在');
      return { kind, id, status: 'PENDING' };
    }
    throw new BadRequestException('不支持的失败任务类型');
  }
}
