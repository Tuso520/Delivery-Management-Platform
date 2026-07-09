import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from './database/prisma.service';
import { RedisService } from './database/redis.service';
import { FileStorageService } from './modules/file/file-storage.service';

interface ReadinessResult {
  status: 'ready';
  checks: {
    database: 'ok';
    redis: 'ok';
    storage: 'ok';
  };
}

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: FileStorageService,
  ) {}

  getHealth(): string {
    return 'OK';
  }

  async getReadiness(): Promise<ReadinessResult> {
    const [database, redis, storage] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
      this.storage.getStatus(),
    ]);
    const storageReady = storage.status === 'fulfilled' && storage.value.available;

    if (database.status !== 'fulfilled' || redis.status !== 'fulfilled' || !storageReady) {
      throw new ServiceUnavailableException({
        message: '服务依赖尚未就绪',
        checks: {
          database: database.status === 'fulfilled' ? 'ok' : 'failed',
          redis: redis.status === 'fulfilled' ? 'ok' : 'failed',
          storage: storageReady ? 'ok' : 'failed',
        },
      });
    }

    return {
      status: 'ready',
      checks: { database: 'ok', redis: 'ok', storage: 'ok' },
    };
  }
}
