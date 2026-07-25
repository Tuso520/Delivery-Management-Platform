import type { PrismaService } from '../../../database/prisma.service';
import type { AuditRecoveryService } from '../../operation-log/audit-recovery.service';
import { OperationalRecoveryService } from '../operational-recovery.service';

describe('OperationalRecoveryService', () => {
  it('returns audit, outbox and file-processing failures without sensitive payloads', async () => {
    const prisma = {
      auditFailure: { findMany: jest.fn().mockResolvedValue([{ id: 'audit-1' }]) },
      outboxEvent: { findMany: jest.fn().mockResolvedValue([{ id: 'outbox-1' }]) },
      fileProcessingJob: { findMany: jest.fn().mockResolvedValue([{ id: 'file-1' }]) },
    } as unknown as PrismaService;
    const service = new OperationalRecoveryService(
      prisma,
      { retry: jest.fn() } as unknown as AuditRecoveryService,
    );

    await expect(service.findFailures(500)).resolves.toEqual({
      audit: [{ id: 'audit-1' }],
      outbox: [{ id: 'outbox-1' }],
      fileProcessing: [{ id: 'file-1' }],
    });
    expect(prisma.auditFailure.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });

  it('requeues only DEAD outbox and file-processing work', async () => {
    const outboxUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const fileUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      outboxEvent: { updateMany: outboxUpdate },
      fileProcessingJob: { updateMany: fileUpdate },
    } as unknown as PrismaService;
    const service = new OperationalRecoveryService(
      prisma,
      { retry: jest.fn() } as unknown as AuditRecoveryService,
    );

    await expect(service.retry('outbox', 'outbox-1')).resolves.toEqual({
      kind: 'outbox',
      id: 'outbox-1',
      status: 'PENDING',
    });
    await expect(service.retry('file-processing', 'file-1')).resolves.toEqual({
      kind: 'file-processing',
      id: 'file-1',
      status: 'PENDING',
    });
    expect(outboxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'outbox-1', status: 'DEAD' } }),
    );
    expect(fileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'file-1', status: 'DEAD' } }),
    );
  });
});
