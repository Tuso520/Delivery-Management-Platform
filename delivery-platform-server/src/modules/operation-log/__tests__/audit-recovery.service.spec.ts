import type { PrismaService } from '../../../database/prisma.service';
import { AuditRecoveryService } from '../audit-recovery.service';
import type { OperationLogService } from '../operation-log.service';

describe('AuditRecoveryService', () => {
  it('persists a redacted compensation payload', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'failure-1' });
    const service = new AuditRecoveryService(
      { auditFailure: { create } } as unknown as PrismaService,
      { log: jest.fn() } as unknown as OperationLogService,
    );

    await service.capture(
      {
        userId: 'user-1',
        module: 'integration',
        action: 'patch',
        targetType: 'integration',
        targetId: 'integration-1',
        traceId: 'trace-1',
        afterData: { appSecret: 'secret-value', nested: { accessToken: 'token-value' } },
      },
      new Error('database unavailable'),
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        traceId: 'trace-1',
        operationPayload: expect.objectContaining({
          afterData: {
            appSecret: '[REDACTED]',
            nested: { accessToken: '[REDACTED]' },
          },
        }),
        failureCode: 'AUDIT_WRITE_FAILED',
      }),
    });
  });

  it('replays a pending audit and marks it resolved', async () => {
    const failure = {
      id: 'failure-1',
      traceId: 'trace-1',
      status: 'PENDING',
      attempts: 0,
      operationPayload: {
        userId: 'user-1',
        module: 'project',
        action: 'update',
        targetType: 'project',
        targetId: 'project-1',
        traceId: 'trace-1',
      },
    };
    const update = jest.fn().mockResolvedValue(failure);
    const log = jest.fn().mockResolvedValue({ id: 'log-1' });
    const service = new AuditRecoveryService(
      {
        auditFailure: {
          findUnique: jest.fn().mockResolvedValue(failure),
          update,
        },
      } as unknown as PrismaService,
      { log } as unknown as OperationLogService,
    );

    await expect(service.retry('failure-1')).resolves.toBe(true);
    expect(log).toHaveBeenCalledWith(failure.operationPayload);
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'failure-1' },
      data: { status: 'RESOLVED', resolvedAt: expect.any(Date) },
    });
  });
});
