import { Injectable, OnModuleInit, OnModuleDestroy, Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 3) return null; // stop retrying
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  /**
   * Blacklist a JWT token by its jti claim.
   * @param jti - JWT ID from token payload
   * @param ttlSeconds - Remaining lifetime of the token in seconds
   */
  async blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.client.set(`jti:${jti}`, '1', 'EX', ttlSeconds);
  }

  /**
   * Check if a JWT token has been blacklisted.
   * @param jti - JWT ID from token payload
   * @returns true if the token is blacklisted (logged out)
   */
  async isBlacklisted(jti: string): Promise<boolean> {
    if (!jti) return false;
    const result = await this.client.get(`jti:${jti}`);
    return result !== null;
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
