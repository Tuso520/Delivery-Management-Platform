import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../database/prisma.service';

import { QueryCountryDto } from './dto/query-country.dto';

interface CountryListItem {
  id: string;
  countryCode: string;
  nameZh: string;
  nameEn: string;
  defaultLanguage: string | null;
  defaultCurrency: string | null;
  timezone: string | null;
  weekendRule: string | null;
  entryRequirements: string | null;
  safetyNotes: string | null;
  taxNotes: string | null;
  paymentNotes: string | null;
  supplierNotes: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CountryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryCountryDto): Promise<PaginatedResult<CountryListItem>> {
    const { page = 1, pageSize = 20, keyword, status } = query;

    const where: Prisma.DictionaryItemWhereInput = {
      deletedAt: null,
      status: status ?? 'Active',
      category: {
        categoryCode: 'COUNTRY',
        status: 'Active',
      },
    };

    if (keyword) {
      where.OR = [
        { itemLabel: { contains: keyword } },
        { itemCode: { contains: keyword } },
        { itemValue: { contains: keyword } },
      ];
    }

    const [total, options] = await Promise.all([
      this.prisma.dictionaryItem.count({ where }),
      this.prisma.dictionaryItem.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ sortOrder: 'asc' }, { itemLabel: 'asc' }],
      }),
    ]);
    const metadata = await this.prisma.country.findMany({
      where: { countryCode: { in: options.map((option) => option.itemValue) } },
    });
    const metadataByCode = new Map(metadata.map((country) => [country.countryCode, country]));
    const list = options.map((option): CountryListItem => {
      const country = metadataByCode.get(option.itemValue);
      return {
        id: option.id,
        countryCode: option.itemValue,
        nameZh: option.itemLabel,
        nameEn: country?.nameEn ?? option.itemLabel,
        defaultLanguage: country?.defaultLanguage ?? null,
        defaultCurrency: country?.defaultCurrency ?? null,
        timezone: country?.timezone ?? null,
        weekendRule: country?.weekendRule ?? null,
        entryRequirements: country?.entryRequirements ?? null,
        safetyNotes: country?.safetyNotes ?? null,
        taxNotes: country?.taxNotes ?? null,
        paymentNotes: country?.paymentNotes ?? null,
        supplierNotes: country?.supplierNotes ?? null,
        status: option.status,
        createdAt: option.createdAt,
        updatedAt: option.updatedAt,
      };
    });

    return {
      items: list,
      page,
      pageSize,
      total,
    };
  }
}
