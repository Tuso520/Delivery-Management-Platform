import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import { CreateArchiveTemplateDto, QueryArchiveTemplateDto } from './dto/archive-template.dto';

@Injectable()
export class ArchiveTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryArchiveTemplateDto) {
    const where: Prisma.ArchiveTemplateWhereInput = {};

    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim();
      where.OR = [{ templateCode: { contains: keyword } }, { templateName: { contains: keyword } }];
    }
    if (query.projectType) where.projectType = query.projectType;
    if (query.countryCode) where.countryCode = query.countryCode;
    if (query.languageCode) where.languageCode = query.languageCode;

    return this.prisma.archiveTemplate.findMany({
      where,
      select: {
        id: true,
        templateCode: true,
        templateName: true,
        projectType: true,
        countryCode: true,
        languageCode: true,
        status: true,
        description: true,
        createdBy: true,
        updatedBy: true,
        updater: { select: { id: true, realName: true } },
        createdAt: true,
        updatedAt: true,
        currentPublishedVersion: {
          select: {
            id: true,
            versionNo: true,
            status: true,
            publishedAt: true,
            _count: { select: { folders: true, versionItems: true } },
          },
        },
        _count: { select: { versions: true, projectSnapshots: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const template = await this.prisma.archiveTemplate.findUnique({
      where: { id },
      include: {
        currentPublishedVersion: {
          include: {
            folders: {
              include: { items: { orderBy: { sortOrder: 'asc' } } },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        versions: {
          select: {
            id: true,
            versionNo: true,
            status: true,
            revision: true,
            submittedAt: true,
            publishedAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!template) throw new NotFoundException('档案模板不存在');
    return template;
  }

  async create(dto: CreateArchiveTemplateDto, userId: string) {
    const existing = await this.prisma.archiveTemplate.findUnique({
      where: { templateCode: dto.templateCode },
      select: { id: true },
    });
    if (existing) throw new ConflictException('模板编码已存在');

    return this.prisma.$transaction(async (tx) => {
      const template = await tx.archiveTemplate.create({
        data: {
          templateCode: dto.templateCode,
          templateName: dto.templateName,
          projectType: dto.projectType,
          countryCode: dto.countryCode,
          languageCode: dto.languageCode,
          description: dto.description,
          status: 'DRAFT',
          createdBy: userId,
          updatedBy: userId,
        },
      });
      const draftVersion = await tx.archiveTemplateVersion.create({
        data: {
          templateId: template.id,
          versionNo: dto.version || 'V1.0',
          status: 'DRAFT',
          createdBy: userId,
        },
        select: { id: true, versionNo: true, status: true, revision: true },
      });
      return { ...template, draftVersion };
    });
  }
}
