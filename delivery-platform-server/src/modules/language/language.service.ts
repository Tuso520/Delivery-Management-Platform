import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

import { CreateLanguageDto } from './dto/create-language.dto';
import { CreateTranslationDto, UpdateTranslationDto, QueryTranslationDto } from './dto/translation.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';

@Injectable()
export class LanguageService {
  constructor(private readonly prisma: PrismaService) {}

  // ========== Language CRUD ==========

  async findAll() {
    return this.prisma.language.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const language = await this.prisma.language.findUnique({
      where: { id },
    });

    if (!language) {
      throw new NotFoundException('语言不存在');
    }

    return language;
  }

  async findByCode(code: string) {
    const language = await this.prisma.language.findUnique({
      where: { languageCode: code },
    });

    if (!language) {
      throw new NotFoundException('语言不存在');
    }

    return language;
  }

  async create(dto: CreateLanguageDto) {
    const existing = await this.prisma.language.findUnique({
      where: { languageCode: dto.languageCode },
    });

    if (existing) {
      throw new ConflictException('语言代码已存在');
    }

    return this.prisma.language.create({
      data: {
        languageCode: dto.languageCode,
        languageName: dto.languageName,
      },
    });
  }

  async update(id: string, dto: UpdateLanguageDto) {
    const language = await this.prisma.language.findUnique({
      where: { id },
    });

    if (!language) {
      throw new NotFoundException('语言不存在');
    }

    return this.prisma.language.update({
      where: { id },
      data: {
        languageName: dto.languageName,
      },
    });
  }

  async delete(id: string): Promise<void> {
    const language = await this.prisma.language.findUnique({
      where: { id },
    });

    if (!language) {
      throw new NotFoundException('语言不存在');
    }

    await this.prisma.language.update({
      where: { id },
      data: { status: 'Inactive' },
    });
  }

  // ========== Translation Management ==========

  async findTranslations(query: QueryTranslationDto) {
    const { contentType, contentId, languageCode } = query;

    return this.prisma.translation.findMany({
      where: { contentType, contentId, languageCode },
      orderBy: [{ contentId: 'asc' }, { languageCode: 'asc' }],
    });
  }

  async upsertTranslation(dto: CreateTranslationDto) {
    return this.prisma.translation.upsert({
      where: {
        contentType_contentId_fieldName_languageCode: {
          contentType: dto.contentType,
          contentId: dto.contentId,
          fieldName: dto.fieldName,
          languageCode: dto.languageCode,
        },
      },
      create: {
        contentType: dto.contentType,
        contentId: dto.contentId,
        fieldName: dto.fieldName,
        languageCode: dto.languageCode,
        fieldValue: dto.fieldValue,
      },
      update: {
        fieldValue: dto.fieldValue,
      },
    });
  }

  async updateTranslation(id: string, dto: UpdateTranslationDto) {
    const translation = await this.prisma.translation.findUnique({
      where: { id },
    });

    if (!translation) {
      throw new NotFoundException('翻译记录不存在');
    }

    return this.prisma.translation.update({
      where: { id },
      data: {
        fieldValue: dto.fieldValue,
      },
    });
  }

  async deleteTranslation(id: string): Promise<void> {
    const translation = await this.prisma.translation.findUnique({
      where: { id },
    });

    if (!translation) {
      throw new NotFoundException('翻译记录不存在');
    }

    await this.prisma.translation.delete({
      where: { id },
    });
  }
}
