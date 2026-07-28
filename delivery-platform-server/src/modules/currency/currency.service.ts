import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { enqueueDomainEvent } from '../../common/events/outbox';
import { PrismaService } from '../../database/prisma.service';

import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { ExchangeRateProvider } from './exchange-rate.provider';

@Injectable()
export class CurrencyService {
  private readonly rateProvider = new ExchangeRateProvider();

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const options = await this.prisma.dictionaryItem.findMany({
      where: {
        deletedAt: null,
        category: {
          categoryCode: 'CURRENCY',
          status: 'Active',
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { itemLabel: 'asc' }],
    });
    const metadata = await this.prisma.currency.findMany({
      where: { currencyCode: { in: options.map((option) => option.itemValue) } },
    });
    const currentCnyRates = await this.prisma.exchangeRate.findMany({
      where: {
        fromCurrency: { in: options.map((option) => option.itemValue) },
        toCurrency: 'CNY',
        rateDate: { lte: new Date() },
      },
      orderBy: { rateDate: 'desc' },
      distinct: ['fromCurrency'],
    });
    const metadataByCode = new Map(metadata.map((currency) => [currency.currencyCode, currency]));
    const cnyRateByCode = new Map(
      currentCnyRates.map((rate) => [rate.fromCurrency, rate]),
    );
    return options.map((option) => {
      const currency = metadataByCode.get(option.itemValue);
      const currentCnyRate = cnyRateByCode.get(option.itemValue);
      return {
        id: option.id,
        currencyCode: option.itemValue,
        currencyName: option.itemLabel,
        currencySymbol: currency?.currencySymbol ?? null,
        decimalPlaces: currency?.decimalPlaces ?? 2,
        status: option.status,
        cnyRate:
          currency?.cnyRate ??
          currentCnyRate?.rate ??
          (option.itemValue === 'CNY' ? new Prisma.Decimal(1) : null),
        rateDate: currency?.rateDate ?? currentCnyRate?.rateDate ?? null,
        rateLocked: currency?.rateLocked ?? false,
        lockedBy: currency?.lockedBy ?? null,
        lockedAt: currency?.lockedAt ?? null,
        rateSource:
          currency?.rateSource ??
          currentCnyRate?.source ??
          (option.itemValue === 'CNY' ? 'identity' : null),
        createdAt: option.createdAt,
        updatedAt: currency?.updatedAt ?? option.updatedAt,
      };
    });
  }

  private async findByCode(code: string) {
    const normalizedCode = code.trim().toUpperCase();
    const option = await this.prisma.dictionaryItem.findFirst({
      where: {
        itemValue: normalizedCode,
        status: 'Active',
        deletedAt: null,
        category: {
          categoryCode: 'CURRENCY',
          status: 'Active',
        },
      },
      select: { itemValue: true, itemLabel: true },
    });
    if (!option) {
      throw new NotFoundException('币种字段配置不存在或已停用');
    }
    return this.prisma.currency.upsert({
      where: { currencyCode: option.itemValue },
      create: {
        currencyCode: option.itemValue,
        currencyName: option.itemLabel,
      },
      update: {},
    });
  }

  private update(id: string, dto: UpdateCurrencyDto) {
    return this.prisma.currency.update({
      where: { id },
      data: {
        currencySymbol: dto.currencySymbol,
        decimalPlaces: dto.decimalPlaces,
        ...(dto.cnyRate !== undefined && {
          cnyRate: dto.cnyRate,
          rateDate: new Date(),
          rateSource: 'manual',
        }),
      },
    });
  }

  async updateByCode(code: string, dto: UpdateCurrencyDto) {
    const currency = await this.findByCode(code);
    return this.update(currency.id, dto);
  }

  async lockCurrencyRate(code: string, userId: string) {
    const currency = await this.findByCode(code);
    if (currency.cnyRate === null) {
      throw new ConflictException('请先设置人民币汇率再锁定');
    }
    return this.prisma.currency.update({
      where: { id: currency.id },
      data: { rateLocked: true, lockedBy: userId, lockedAt: new Date() },
    });
  }

  async unlockCurrencyRate(code: string) {
    const currency = await this.findByCode(code);
    return this.prisma.currency.update({
      where: { id: currency.id },
      data: { rateLocked: false, lockedBy: null, lockedAt: null },
    });
  }

  async syncOnlineRates(baseCurrency = 'CNY') {
    const options = await this.prisma.dictionaryItem.findMany({
      where: {
        status: 'Active',
        deletedAt: null,
        category: {
          categoryCode: 'CURRENCY',
          status: 'Active',
        },
      },
      select: { itemValue: true, itemLabel: true },
      orderBy: { itemValue: 'asc' },
    });
    await Promise.all(
      options.map((option) =>
        this.prisma.currency.upsert({
          where: { currencyCode: option.itemValue },
          create: {
            currencyCode: option.itemValue,
            currencyName: option.itemLabel,
          },
          update: {},
        }),
      ),
    );
    const targetCurrencies = options.map((option) => option.itemValue);

    let onlineRates;
    try {
      onlineRates = await this.rateProvider.fetchLatest(
        baseCurrency,
        targetCurrencies,
      );
    } catch (error) {
      throw new BadGatewayException(
        error instanceof Error ? error.message : '在线汇率同步失败',
      );
    }

    const rateDate = new Date(onlineRates.rateDate);
    rateDate.setUTCHours(0, 0, 0, 0);
    let syncedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      if (onlineRates.baseCurrency === 'CNY') {
        await tx.currency.updateMany({
          where: { currencyCode: 'CNY', rateLocked: false },
          data: { cnyRate: 1, rateDate, rateSource: onlineRates.source },
        });
      }
      for (const item of onlineRates.rates) {
        const directRate = new Prisma.Decimal(item.rate);
        const inverseRate = new Prisma.Decimal(1).div(directRate);
        const pairs = [
          {
            fromCurrency: onlineRates.baseCurrency,
            toCurrency: item.currencyCode,
            rate: directRate,
          },
          {
            fromCurrency: item.currencyCode,
            toCurrency: onlineRates.baseCurrency,
            rate: inverseRate,
          },
        ];

        for (const pair of pairs) {
          const existing = await tx.exchangeRate.findUnique({
            where: {
              fromCurrency_toCurrency_rateDate: {
                fromCurrency: pair.fromCurrency,
                toCurrency: pair.toCurrency,
                rateDate,
              },
            },
            select: { id: true, isLocked: true },
          });
          if (existing?.isLocked) {
            continue;
          }
          await tx.exchangeRate.upsert({
            where: {
              fromCurrency_toCurrency_rateDate: {
                fromCurrency: pair.fromCurrency,
                toCurrency: pair.toCurrency,
                rateDate,
              },
            },
            create: {
              ...pair,
              rateDate,
              source: onlineRates.source,
            },
            update: {
              rate: pair.rate,
              source: onlineRates.source,
            },
          });
          syncedCount += 1;
        }
        if (onlineRates.baseCurrency === 'CNY') {
          await tx.currency.updateMany({
            where: { currencyCode: item.currencyCode, rateLocked: false },
            data: {
              cnyRate: inverseRate,
              rateDate,
              rateSource: onlineRates.source,
            },
          });
        }
      }
      await enqueueDomainEvent(tx, {
        eventType: 'CurrencyRateUpdated',
        aggregateType: 'currency',
        aggregateId: onlineRates.baseCurrency,
        deduplicationKey: `CurrencyRateUpdated:${onlineRates.baseCurrency}:${rateDate.toISOString()}`,
        payload: {
          baseCurrency: onlineRates.baseCurrency,
          rateDate: rateDate.toISOString(),
          source: onlineRates.source,
          syncedCount,
        },
      });
    });

    return {
      baseCurrency: onlineRates.baseCurrency,
      rateDate,
      source: onlineRates.source,
      sourceUrl: onlineRates.sourceUrl,
      syncedCount,
    };
  }
}
