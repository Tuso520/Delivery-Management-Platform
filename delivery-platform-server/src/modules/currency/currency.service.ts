import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { enqueueDomainEvent } from '../../common/events/outbox';
import { PrismaService } from '../../database/prisma.service';

import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { ExchangeRateProvider } from './exchange-rate.provider';

@Injectable()
export class CurrencyService {
  private readonly rateProvider = new ExchangeRateProvider();

  constructor(private readonly prisma: PrismaService) {}

  // ========== Currency CRUD ==========

  async findAll() {
    return this.prisma.currency.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByCode(code: string) {
    const normalizedCode = code.trim().toUpperCase();
    const currency = await this.prisma.currency.findUnique({
      where: { currencyCode: normalizedCode },
    });

    if (!currency) {
      throw new NotFoundException('币种不存在');
    }

    return currency;
  }

  async create(dto: CreateCurrencyDto) {
    const existing = await this.prisma.currency.findUnique({
      where: { currencyCode: dto.currencyCode },
    });

    if (existing) {
      throw new ConflictException('币种代码已存在');
    }

    return this.prisma.currency.create({
      data: {
        currencyCode: dto.currencyCode,
        currencyName: dto.currencyName,
        currencySymbol: dto.currencySymbol,
        decimalPlaces: dto.decimalPlaces ?? 2,
      },
    });
  }

  private update(id: string, dto: UpdateCurrencyDto) {
    return this.prisma.currency.update({
      where: { id },
      data: {
        currencyName: dto.currencyName,
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

  async disableByCode(code: string) {
    const currency = await this.findByCode(code);
    return this.prisma.currency.update({
      where: { id: currency.id },
      data: { status: 'Inactive' },
    });
  }

  async syncOnlineRates(baseCurrency = 'CNY') {
    const currencies = await this.prisma.currency.findMany({
      where: { status: 'Active' },
      select: { currencyCode: true },
      orderBy: { currencyCode: 'asc' },
    });
    const targetCurrencies = currencies.map((item) => item.currencyCode);

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
