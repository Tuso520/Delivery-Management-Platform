import { ServiceUnavailableException } from '@nestjs/common';

import { AppService } from './app.service';
import type { PrismaService } from './database/prisma.service';
import type { RedisService } from './database/redis.service';
import type { FileStorageService } from './modules/file/file-storage.service';

describe('AppService readiness', () => {
  function createService(options: { database?: boolean; redis?: boolean; storage?: boolean } = {}) {
    const databaseReady = options.database ?? true;
    const redisReady = options.redis ?? true;
    const storageReady = options.storage ?? true;
    return new AppService(
      {
        $queryRaw: databaseReady
          ? jest.fn().mockResolvedValue([{ ok: 1 }])
          : jest.fn().mockRejectedValue(new Error('database unavailable')),
      } as unknown as PrismaService,
      {
        ping: redisReady
          ? jest.fn().mockResolvedValue('PONG')
          : jest.fn().mockRejectedValue(new Error('redis unavailable')),
      } as unknown as RedisService,
      {
        getStatus: jest.fn().mockResolvedValue({
          bucket: 'delivery-platform',
          available: storageReady,
        }),
      } as unknown as FileStorageService,
    );
  }

  it('reports ready only when all required dependencies are available', async () => {
    await expect(createService().getReadiness()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'ok', redis: 'ok', storage: 'ok' },
    });
  });

  it('returns 503 semantics when a dependency is unavailable', async () => {
    await expect(createService({ storage: false }).getReadiness())
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
