import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { getCurrentTraceId } from '../../common/utils/request-trace.util';
import { PrismaService } from '../../database/prisma.service';

import { CreateOperationLogDto } from './dto/operation-log.dto';
import { OperationLogService } from './operation-log.service';

const MAX_ATTEMPTS = 10;

@Injectable()
export class AuditRecoveryService {
  private readonly logger = new Logger(AuditRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly operationLog: OperationLogService,
  ) {}

  async capture(dto: CreateOperationLogDto, error: unknown): Promise<void> {
    const traceId = dto.traceId ?? getCurrentTraceId() ?? 'trace-unavailable';
    try {
      await this.prisma.auditFailure.create({
        data: {
          traceId,
          operationPayload: this.toJson(dto),
          failureCode: this.failureCode(error),
          failureMessage: this.failureMessage(error),
        },
      });
    } catch (captureError) {
      this.logger.error(
        `AUDIT_COMPENSATION_PERSIST_FAILED traceId=${traceId} code=${this.failureCode(captureError)}`,
      );
    }
  }

  async processBatch(limit = 20): Promise<number> {
    const failures = await this.prisma.auditFailure.findMany({
      where: {
        status: 'PENDING',
        attempts: { lt: MAX_ATTEMPTS },
        availableAt: { lte: new Date() },
      },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      take: Math.max(1, Math.min(limit, 100)),
    });
    for (const failure of failures) await this.retry(failure.id);
    return failures.length;
  }

  async retry(id: string): Promise<boolean> {
    const failure = await this.prisma.auditFailure.findUnique({ where: { id } });
    if (!failure || failure.status === 'RESOLVED') return false;

    const attempt = failure.attempts + 1;
    await this.prisma.auditFailure.update({
      where: { id },
      data: {
        status: 'PROCESSING',
        attempts: attempt,
        lastAttemptAt: new Date(),
      },
    });

    try {
      await this.operationLog.log(
        failure.operationPayload as unknown as CreateOperationLogDto,
      );
      await this.prisma.auditFailure.update({
        where: { id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      return true;
    } catch (error) {
      const dead = attempt >= MAX_ATTEMPTS;
      const delayMs = Math.min(5_000 * 2 ** Math.max(0, attempt - 1), 15 * 60_000);
      await this.prisma.auditFailure.update({
        where: { id },
        data: {
          status: dead ? 'DEAD' : 'PENDING',
          availableAt: dead ? undefined : new Date(Date.now() + delayMs),
          failureCode: this.failureCode(error),
          failureMessage: this.failureMessage(error),
        },
      });
      this.logger.warn(
        `AUDIT_COMPENSATION_RETRY_FAILED id=${id} traceId=${failure.traceId} attempt=${attempt}`,
      );
      return false;
    }
  }

  private toJson(dto: CreateOperationLogDto): Prisma.InputJsonObject {
    return Object.fromEntries(
      Object.entries(dto)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, this.redact(value, key)]),
    ) as Prisma.InputJsonObject;
  }

  private redact(value: unknown, key?: string): unknown {
    if (
      key &&
      /password|passphrase|secret|token|api.?key|access.?key|private.?key|encrypt.?key|webhook.?url|authorization|cookie|credential/iu.test(
        key,
      )
    ) {
      return '[REDACTED]';
    }
    if (Array.isArray(value)) return value.map((item) => this.redact(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([itemKey, item]) => [
          itemKey,
          this.redact(item, itemKey),
        ]),
      );
    }
    return value;
  }

  private failureCode(error: unknown): string {
    return error instanceof Prisma.PrismaClientKnownRequestError
      ? `PRISMA_${error.code}`
      : 'AUDIT_WRITE_FAILED';
  }

  private failureMessage(error: unknown): string | null {
    if (!(error instanceof Error)) return null;
    return error.message.replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]').slice(0, 1000);
  }
}
