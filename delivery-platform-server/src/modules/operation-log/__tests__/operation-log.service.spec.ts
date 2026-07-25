import { runWithTraceId } from '../../../common/utils/request-trace.util';
import type { PrismaService } from '../../../database/prisma.service';
import { OperationLogService } from '../operation-log.service';

describe('OperationLogService sensitive data handling', () => {
  it('recursively redacts sensitive values before persistence', async () => {
    const create = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'log-1',
      createdAt: new Date('2026-07-11T00:00:00.000Z'),
      ...data,
    }));
    const prisma = {
      operationLog: { create },
    } as unknown as PrismaService;
    const service = new OperationLogService(prisma);

    const result = await service.log({
      userId: 'user-1',
      module: 'integration',
      action: 'update',
      targetType: 'integration',
      targetId: 'integration-1',
      afterData: {
        appId: 'visible',
        nested: {
          appSecret: 'must-not-be-stored',
          webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/private',
          credentials: [{ accessToken: 'must-not-be-stored' }],
        },
      },
      errorReason: 'token=must-not-be-stored upstream failure',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        afterData: {
          appId: 'visible',
          nested: {
            appSecret: '[REDACTED]',
            webhookUrl: '[REDACTED]',
            credentials: '[REDACTED]',
          },
        },
        traceId: expect.any(String),
        errorReason: 'token=[REDACTED] upstream failure',
      }),
    });
    expect(JSON.stringify(result)).not.toContain('must-not-be-stored');
  });

  it('uses the active request trace when callers do not provide one', async () => {
    const create = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'log-2',
      createdAt: new Date('2026-07-11T00:00:00.000Z'),
      ...data,
    }));
    const service = new OperationLogService({
      operationLog: { create },
    } as unknown as PrismaService);

    await runWithTraceId('request-trace-service', () =>
      service.log({
        userId: 'user-1',
        module: 'attachment',
        action: 'preview',
        targetType: 'attachment',
        targetId: 'attachment-1',
      }),
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ traceId: 'request-trace-service' }),
    });
  });
});
