import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import { CreateCurrencyDto } from './dto/create-currency.dto';
import { CreateExchangeRateDto, QueryExchangeRateDto } from './dto/create-exchange-rate.dto';
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

  async findById(id: string) {
    const currency = await this.prisma.currency.findUnique({
      where: { id },
    });

    if (!currency) {
      throw new NotFoundException('币种不存在');
    }

    return currency;
  }

  async findByCode(code: string) {
    const currency = await this.prisma.currency.findUnique({
      where: { currencyCode: code },
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

  async update(id: string, dto: UpdateCurrencyDto) {
    const currency = await this.prisma.currency.findUnique({
      where: { id },
    });

    if (!currency) {
      throw new NotFoundException('币种不存在');
    }

    return this.prisma.currency.update({
      where: { id },
      data: {
        currencyName: dto.currencyName,
        currencySymbol: dto.currencySymbol,
        decimalPlaces: dto.decimalPlaces,
      },
    });
  }

  async delete(id: string): Promise<void> {
    const currency = await this.prisma.currency.findUnique({
      where: { id },
    });

    if (!currency) {
      throw new NotFoundException('币种不存在');
    }

    await this.prisma.currency.update({
      where: { id },
      data: { status: 'Inactive' },
    });
  }

  // ========== Exchange Rate Management ==========

  async getRates(query: QueryExchangeRateDto) {
    const where: Record<string, unknown> = {};

    if (query.from) {
      where.fromCurrency = query.from;
    }

    if (query.to) {
      where.toCurrency = query.to;
    }

    return this.prisma.exchangeRate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async addRate(dto: CreateExchangeRateDto) {
    const rateDate = dto.rateDate ? new Date(dto.rateDate) : new Date();
    rateDate.setHours(0, 0, 0, 0);

    // Check if both currencies exist
    const fromCurrency = await this.prisma.currency.findUnique({
      where: { currencyCode: dto.fromCurrency },
    });
    if (!fromCurrency) {
      throw new NotFoundException(`源币种 ${dto.fromCurrency} 不存在`);
    }

    const toCurrency = await this.prisma.currency.findUnique({
      where: { currencyCode: dto.toCurrency },
    });
    if (!toCurrency) {
      throw new NotFoundException(`目标币种 ${dto.toCurrency} 不存在`);
    }

    return this.prisma.exchangeRate.create({
      data: {
        fromCurrency: dto.fromCurrency,
        toCurrency: dto.toCurrency,
        rate: dto.rate,
        rateDate,
        source: dto.source ?? 'manual',
      },
    });
  }

  async lockRate(id: string) {
    const rate = await this.prisma.exchangeRate.findUnique({
      where: { id },
    });

    if (!rate) {
      throw new NotFoundException('汇率记录不存在');
    }

    return this.prisma.exchangeRate.update({
      where: { id },
      data: { isLocked: true },
    });
  }

  async unlockRate(id: string) {
    const rate = await this.prisma.exchangeRate.findUnique({
      where: { id },
    });

    if (!rate) {
      throw new NotFoundException('汇率记录不存在');
    }

    return this.prisma.exchangeRate.update({
      where: { id },
      data: { isLocked: false },
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
      }
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
