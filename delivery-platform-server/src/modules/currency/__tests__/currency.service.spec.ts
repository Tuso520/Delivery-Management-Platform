import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { PrismaService } from '../../../database/prisma.service';
import { CurrencyService } from '../currency.service';

describe('CurrencyService target rate workflow', () => {
  it('returns the same latest CNY exchange rate used by project amount conversion', async () => {
    const currentRate = {
      fromCurrency: 'VND',
      toCurrency: 'CNY',
      rate: new Prisma.Decimal('0.00028100'),
      rateDate: new Date('2026-07-28T00:00:00.000Z'),
      source: 'seed',
    };
    const prisma = {
      dictionaryItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'currency-vnd',
            itemValue: 'VND',
            itemLabel: '越南盾',
            status: 'Active',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]),
      },
      currency: {
        findMany: jest.fn().mockResolvedValue([
          {
            currencyCode: 'VND',
            currencySymbol: '₫',
            decimalPlaces: 2,
            cnyRate: null,
            rateDate: null,
            rateLocked: false,
            lockedBy: null,
            lockedAt: null,
            rateSource: null,
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]),
      },
      exchangeRate: {
        findMany: jest.fn().mockResolvedValue([currentRate]),
      },
    } as unknown as PrismaService;
    const service = new CurrencyService(prisma);

    const result = await service.findAll();

    expect(prisma.exchangeRate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          fromCurrency: { in: ['VND'] },
          toCurrency: 'CNY',
        }),
        orderBy: { rateDate: 'desc' },
        distinct: ['fromCurrency'],
      }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        currencyCode: 'VND',
        cnyRate: currentRate.rate,
        rateDate: currentRate.rateDate,
        rateSource: 'seed',
      }),
    );
  });

  it('does not lock a currency before a CNY rate exists', async () => {
    const prisma = {
      dictionaryItem: {
        findFirst: jest.fn().mockResolvedValue({
          itemValue: 'USD',
          itemLabel: '美元',
        }),
      },
      currency: {
        upsert: jest.fn().mockResolvedValue({
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
      dictionaryItem: {
        findMany: jest.fn().mockResolvedValue([
          { itemValue: 'CNY', itemLabel: '人民币' },
          { itemValue: 'USD', itemLabel: '美元' },
        ]),
      },
      currency: {
        upsert: jest.fn().mockResolvedValue({ id: 'currency-1' }),
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
