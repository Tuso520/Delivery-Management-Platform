import type { PrismaService } from '../../../database/prisma.service';
import type { FileStorageService } from '../../file/file-storage.service';
import type { OperationLogService } from '../../operation-log/operation-log.service';
import { SystemOperationsService } from '../system-operations.service';

describe('SystemOperationsService integration secrets', () => {
  it('preserves stored secrets when an edited form sends the masked value', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'integration-1',
      provider: 'email',
      configValue: {
        host: 'smtp.example.com',
        password: 'real-secret',
      },
    });
    const prisma = {
      integrationConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'integration-1',
          configValue: {
            host: 'smtp.old.example.com',
            password: 'real-secret',
          },
        }),
        update,
      },
    } as unknown as PrismaService;
    const storage = {} as FileStorageService;
    const operationLog = {
      log: jest.fn(),
    } as unknown as OperationLogService;
    const service = new SystemOperationsService(prisma, storage, operationLog);

    await service.upsertIntegration(
      'integration-1',
      {
        provider: 'email',
        configName: '交付通知邮箱',
        configValue: {
          host: 'smtp.example.com',
          password: '******',
        },
      },
      'admin-1',
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: expect.objectContaining({
        configValue: {
          host: 'smtp.example.com',
          password: 'real-secret',
        },
      }),
    });
  });
});
