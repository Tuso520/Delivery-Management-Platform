import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../database/prisma.service';

import { CreateCountryDto } from './dto/create-country.dto';
import { QueryCountryDto } from './dto/query-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';

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

    const where: Prisma.CountryWhereInput = {};

    if (keyword) {
      where.OR = [
        { nameZh: { contains: keyword } },
        { nameEn: { contains: keyword } },
        { countryCode: { contains: keyword } },
      ];
    }

    if (status) {
      where.status = status;
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
      list,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(id: string) {
    const country = await this.prisma.country.findUnique({
      where: { id },
    });

    if (!country) {
      throw new NotFoundException('国家不存在');
    }

    return country;
  }

  async findByCode(countryCode: string) {
    const country = await this.prisma.country.findUnique({
      where: { countryCode },
    });

    if (!country) {
      throw new NotFoundException('国家不存在');
    }

    return country;
  }

  async create(dto: CreateCountryDto) {
    const existing = await this.prisma.country.findUnique({
      where: { countryCode: dto.countryCode },
    });

    if (existing) {
      throw new ConflictException('国家代码已存在');
    }

    return this.prisma.country.create({
      data: {
        countryCode: dto.countryCode,
        nameZh: dto.nameZh,
        nameEn: dto.nameEn,
        defaultLanguage: dto.defaultLanguage,
        defaultCurrency: dto.defaultCurrency,
        timezone: dto.timezone,
        weekendRule: dto.weekendRule,
        entryRequirements: dto.entryRequirements,
        safetyNotes: dto.safetyNotes,
        taxNotes: dto.taxNotes,
        paymentNotes: dto.paymentNotes,
        supplierNotes: dto.supplierNotes,
      },
    });
  }

  async update(id: string, dto: UpdateCountryDto) {
    const country = await this.prisma.country.findUnique({
      where: { id },
    });

    if (!country) {
      throw new NotFoundException('国家不存在');
    }

    return this.prisma.country.update({
      where: { id },
      data: {
        nameZh: dto.nameZh,
        nameEn: dto.nameEn,
        defaultLanguage: dto.defaultLanguage,
        defaultCurrency: dto.defaultCurrency,
        timezone: dto.timezone,
        weekendRule: dto.weekendRule,
        entryRequirements: dto.entryRequirements,
        safetyNotes: dto.safetyNotes,
        taxNotes: dto.taxNotes,
        paymentNotes: dto.paymentNotes,
        supplierNotes: dto.supplierNotes,
      },
    });
  }

  async delete(id: string): Promise<void> {
    const country = await this.prisma.country.findUnique({
      where: { id },
    });

    if (!country) {
      throw new NotFoundException('国家不存在');
    }

    await this.prisma.country.update({
      where: { id },
      data: { status: 'Inactive' },
    });
  }
}
