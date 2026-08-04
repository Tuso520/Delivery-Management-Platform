import { Injectable, OnModuleInit, OnModuleDestroy, Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor(configService: ConfigService) {
    const redisUrl = configService.getOrThrow<string>('redis.url');
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

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async getSecurityCounter(key: string): Promise<number> {
    const value = await this.client.get(`security:${key}`);
    const parsed = Number.parseInt(value ?? '0', 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async incrementSecurityCounter(key: string, ttlSeconds: number): Promise<number> {
    const value = await this.client.eval(
      [
        "local count = redis.call('INCR', KEYS[1])",
        "if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
        'return count',
      ].join('\n'),
      1,
      `security:${key}`,
      String(Math.max(1, ttlSeconds)),
    );
    return typeof value === 'number' ? value : Number(value);
  }

  async clearSecurityCounter(key: string): Promise<void> {
    await this.client.del(`security:${key}`);
  }

  async storeOneTimeJson(
    namespace: string,
    idHash: string,
    value: Record<string, unknown>,
    ttlSeconds: number,
  ): Promise<void> {
    this.assertOneTimeKey(namespace, idHash);
    const stored = await this.client.set(
      `one-time:${namespace}:${idHash}`,
      JSON.stringify(value),
      'EX',
      Math.max(1, ttlSeconds),
      'NX',
    );
    if (stored !== 'OK') throw new Error('一次性凭据发生冲突');
  }

  async consumeOneTimeJson(
    namespace: string,
    idHash: string,
  ): Promise<Record<string, unknown> | null> {
    this.assertOneTimeKey(namespace, idHash);
    const key = `one-time:${namespace}:${idHash}`;
    const value = await this.client.eval(
      "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      1,
      key,
    );
    if (typeof value !== 'string') return null;
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private assertOneTimeKey(namespace: string, idHash: string): void {
    if (!/^[a-z0-9-]{1,40}$/.test(namespace) || !/^[a-f0-9]{64}$/.test(idHash)) {
      throw new Error('一次性凭据键无效');
    }
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
