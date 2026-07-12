import { ConflictException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import { CurrencyService } from '../currency.service';

describe('CurrencyService target rate workflow', () => {
  it('does not lock a currency before a CNY rate exists', async () => {
    const prisma = {
      currency: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'usd',
          currencyCode: 'USD',
          cnyRate: null,
        }),
      },
    } as unknown as PrismaService;
    const service = new CurrencyService(prisma);

    await expect(service.lockCurrencyRate('USD', 'user-1')).rejects.toThrow(
      new ConflictException('请先设置人民币汇率再锁定'),
    );
  });

  it('syncs unlocked currency snapshots and emits an outbox event in the transaction', async () => {
    const transaction = {
      currency: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      exchangeRate: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'rate-1' }),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
    };
    const prisma = {
      currency: {
        findMany: jest.fn().mockResolvedValue([{ currencyCode: 'CNY' }, { currencyCode: 'USD' }]),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new CurrencyService(prisma);
    const mutable = service as unknown as {
      rateProvider: {
        fetchLatest: jest.Mock;
      };
    };
    mutable.rateProvider = {
      fetchLatest: jest.fn().mockResolvedValue({
        baseCurrency: 'CNY',
        rateDate: '2026-07-11',
        source: 'test-provider',
        sourceUrl: 'https://rates.example.test',
        rates: [{ currencyCode: 'USD', rate: 0.14 }],
      }),
    };

    const result = await service.syncOnlineRates('CNY');

    expect(result).toEqual(
      expect.objectContaining({
        baseCurrency: 'CNY',
        source: 'test-provider',
        syncedCount: 2,
      }),
    );
    expect(transaction.currency.updateMany).toHaveBeenCalledWith({
      where: { currencyCode: 'USD', rateLocked: false },
      data: expect.objectContaining({
        cnyRate: expect.anything(),
        rateSource: 'test-provider',
      }),
    });
    expect(transaction.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'CurrencyRateUpdated',
        aggregateType: 'currency',
        aggregateId: 'CNY',
        deduplicationKey: `CurrencyRateUpdated:CNY:${result.rateDate.toISOString()}`,
        payload: {
          baseCurrency: 'CNY',
          rateDate: result.rateDate.toISOString(),
          source: 'test-provider',
          syncedCount: 2,
        },
      }),
    });
  });
});
