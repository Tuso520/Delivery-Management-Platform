import { Injectable, OnModuleInit, OnModuleDestroy, Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    super({
      log:
        configService.get<string>('app.nodeEnv') === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
      // Prisma's 5s interactive-transaction default is too short for the
      // atomic write paths that also create review, audit and outbox rows.
      // Keep the transaction bounded, while allowing normal database load or
      // cross-region latency to complete without turning a safe upload into a
      // spurious rollback.
      transactionOptions: {
        maxWait: 10_000,
        timeout: 30_000,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
