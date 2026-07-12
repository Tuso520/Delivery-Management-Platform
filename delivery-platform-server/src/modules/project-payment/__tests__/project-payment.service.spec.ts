import type { PrismaService } from '../../../database/prisma.service';
import type { OperationLogService } from '../../operation-log/operation-log.service';
import type { ProjectAccessService } from '../../project/project-access.service';
import { ProjectPaymentService } from '../project-payment.service';

describe('ProjectPaymentService sensitive read audit', () => {
  const payment = {
    id: 'payment-1',
    originalAmount: decimal(100),
    exchangeRate: decimal(7),
    convertedAmount: decimal(700),
    receivedOriginalAmount: decimal(20),
    receivedConvertedAmount: decimal(140),
  };

  it('persists the cost-read audit in the same transaction before returning data', async () => {
    const tx = {
      projectPayment: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([payment]),
      },
      operationLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;
    const projectAccess = {
      buildProjectWhere: jest.fn().mockResolvedValue({ id: { in: ['project-1'] } }),
    } as unknown as ProjectAccessService;
    const operationLog = {
      log: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    } as unknown as OperationLogService;
    const service = new ProjectPaymentService(prisma, projectAccess, operationLog);

    const result = await service.findAll(
      { page: 1, pageSize: 20, projectId: 'project-1' },
      'finance-1',
      { traceId: 'trace-1', ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(operationLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'finance-1',
        action: 'view_cost',
        targetId: 'project-1',
        traceId: 'trace-1',
        afterData: expect.objectContaining({ resultCount: 1, total: 1 }),
      }),
      tx,
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({ originalAmount: 100, convertedAmount: 700 }),
    );
  });

  it('does not return sensitive data when the audit write fails', async () => {
    const tx = {
      projectPayment: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([payment]),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;
    const projectAccess = {
      buildProjectWhere: jest.fn().mockResolvedValue({}),
    } as unknown as ProjectAccessService;
    const operationLog = {
      log: jest.fn().mockRejectedValue(new Error('audit unavailable')),
    } as unknown as OperationLogService;
    const service = new ProjectPaymentService(prisma, projectAccess, operationLog);

    await expect(service.findAll({}, 'finance-1')).rejects.toThrow('audit unavailable');
  });
});

function decimal(value: number) {
  return { toNumber: () => value };
}
