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

    const where: Prisma.CountryWhereInput = {
      status: status ?? 'Active',
    };

    if (keyword) {
      where.OR = [
        { nameZh: { contains: keyword } },
        { nameEn: { contains: keyword } },
        { countryCode: { contains: keyword } },
      ];
    }

    const [total, list] = await Promise.all([
      this.prisma.country.count({ where }),
      this.prisma.country.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: list,
      page,
      pageSize,
      total,
    };
  }
}
