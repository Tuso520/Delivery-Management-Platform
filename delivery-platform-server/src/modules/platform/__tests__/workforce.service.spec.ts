import type { PrismaService } from '../../../database/prisma.service';
import { OperationLogService } from '../../operation-log/operation-log.service';
import { WorkforceService } from '../workforce.service';

describe('WorkforceService completion records', () => {
  it('publishes resolvable Nest dependency metadata', () => {
    const dependencies = Reflect.getMetadata(
      'design:paramtypes',
      WorkforceService,
    ) as unknown[];

    expect(dependencies[1]).toBe(OperationLogService);
  });

  it('completes a training and timestamps attended participants', async () => {
    const transaction = {
      trainingParticipant: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      trainingPlan: {
        update: jest.fn().mockResolvedValue({
          id: 'training-1',
          status: 'Completed',
        }),
      },
    };
    const prisma = {
      trainingPlan: {
        findUnique: jest.fn().mockResolvedValue({ id: 'training-1' }),
      },
      $transaction: jest.fn().mockImplementation(
        (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
      ),
    } as unknown as PrismaService;
    const operationLog = {
      log: jest.fn(),
    } as unknown as OperationLogService;
    const service = new WorkforceService(prisma, operationLog);

    await service.completeTraining('training-1');

    expect(transaction.trainingParticipant.updateMany).toHaveBeenCalledWith({
      where: { trainingId: 'training-1', attendance: 'Attended' },
      data: { completedAt: expect.any(Date) },
    });
    expect(transaction.trainingPlan.update).toHaveBeenCalledWith({
      where: { id: 'training-1' },
      data: { status: 'Completed' },
    });
  });
});
