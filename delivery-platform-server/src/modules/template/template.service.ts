import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { ApprovalService } from '../platform/approval.service';

import { CreateTemplateVersionDto } from './dto/create-template-version.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { QueryTemplateDto } from './dto/query-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

interface TemplateListItem {
  id: string;
  templateNo: string;
  name: string;
  category: string;
  countryCode: string | null;
  projectType: string | null;
  stageCode: string | null;
  applicableRole: string | null;
  language: string;
  fileFormat: string | null;
  storagePath: string | null;
  status: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  attachmentId?: string | null;
  attachmentFileName?: string | null;
  previewCount?: number;
  downloadCount?: number;
  versions?: Array<{ id: string; versionNo: string; publishedAt: Date }>;
}

@Injectable()
export class TemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: ApprovalService,
  ) {}

  private async generateTemplateNo(category: string, language: string): Promise<string> {
    const count = await this.prisma.documentTemplate.count({
      where: { category },
    });

    const seq = String(count + 1).padStart(4, '0');
    const categoryCode = category.toUpperCase().slice(0, 4);
    return `DC-TPL-${categoryCode}-${seq}-${language}-V1.0`;
  }

  async findAll(query: QueryTemplateDto): Promise<PaginatedResult<TemplateListItem>> {
    const { page = 1, pageSize = 20, category, countryCode, projectType, language, status } = query;

    const where: Prisma.DocumentTemplateWhereInput = {};

    if (category) {
      where.category = category;
    }
    if (countryCode) {
      where.countryCode = countryCode;
    }
    if (projectType) {
      where.projectType = projectType;
    }
    if (language) {
      where.language = language;
    }
    if (status) {
      where.status = status;
    }

    const [total, list] = await Promise.all([
      this.prisma.documentTemplate.count({ where }),
      this.prisma.documentTemplate.findMany({
        where,
        select: {
          id: true,
          templateNo: true,
          name: true,
          category: true,
          countryCode: true,
          projectType: true,
          stageCode: true,
          applicableRole: true,
          language: true,
          fileFormat: true,
          storagePath: true,
          status: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const enrichedList = await this.attachUsageStats(list);

    return {
      list: enrichedList,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  private async attachUsageStats(
    list: TemplateListItem[],
  ): Promise<TemplateListItem[]> {
    if (!list.length) {
      return list;
    }

    const attachments = await this.prisma.attachment.findMany({
      where: {
        ownerType: 'DocumentTemplate',
        ownerId: { in: list.map((item) => item.id) },
        deletedAt: null,
      },
      select: {
        id: true,
        ownerId: true,
        originalName: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const latestAttachmentByTemplate = new Map<
      string,
      { id: string; originalName: string }
    >();
    for (const attachment of attachments) {
      if (!latestAttachmentByTemplate.has(attachment.ownerId)) {
        latestAttachmentByTemplate.set(attachment.ownerId, {
          id: attachment.id,
          originalName: attachment.originalName,
        });
      }
    }

    const attachmentIds = [...latestAttachmentByTemplate.values()].map(
      (item) => item.id,
    );
    const heatRows = attachmentIds.length
      ? await this.prisma.operationLog.groupBy({
          by: ['targetId', 'action'],
          where: {
            module: 'attachment',
            action: { in: ['preview', 'download'] },
            targetId: { in: attachmentIds },
            result: 'success',
          },
          _count: { _all: true },
        })
      : [];

    const heatMap = new Map<string, number>();
    for (const item of heatRows) {
      heatMap.set(`${item.targetId}:${item.action}`, item._count._all);
    }

    return list.map((item) => {
      const attachment = latestAttachmentByTemplate.get(item.id);
      if (!attachment) {
        return {
          ...item,
          attachmentId: null,
          attachmentFileName: null,
          previewCount: 0,
          downloadCount: 0,
        };
      }

      return {
        ...item,
        attachmentId: attachment.id,
        attachmentFileName: attachment.originalName,
        previewCount: heatMap.get(`${attachment.id}:preview`) ?? 0,
        downloadCount: heatMap.get(`${attachment.id}:download`) ?? 0,
      };
    });
  }

  async findById(id: string) {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { publishedAt: 'desc' },
          select: {
            id: true,
            versionNo: true,
            storagePath: true,
            changeNotes: true,
            publisherId: true,
            publishedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('模板不存在');
    }

    return template;
  }

  async create(dto: CreateTemplateDto, authorId?: string) {
    const templateNo = await this.generateTemplateNo(
      dto.category,
      dto.language || 'zh-CN',
    );

    const template = await this.prisma.documentTemplate.create({
      data: {
        templateNo,
        name: dto.name,
        category: dto.category,
        countryCode: dto.countryCode,
        projectType: dto.projectType,
        stageCode: dto.stageCode,
        applicableRole: dto.applicableRole,
        language: dto.language || 'zh-CN',
        fileFormat: dto.fileFormat,
        storagePath: dto.storagePath,
        authorId,
      },
    });

    // Create initial version record
    if (dto.storagePath) {
      await this.prisma.documentTemplateVersion.create({
        data: {
          templateId: template.id,
          versionNo: 'V1.0',
          storagePath: dto.storagePath,
          changeNotes: '初始版本',
        },
      });
    }

    return template;
  }

  async update(id: string, dto: UpdateTemplateDto) {
    const existing = await this.prisma.documentTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('模板不存在');
    }

    const updated = await this.prisma.documentTemplate.update({
      where: { id },
      data: dto,
    });

    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.prisma.documentTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('模板不存在');
    }

    await this.prisma.documentTemplate.delete({ where: { id } });
  }

  async addVersion(templateId: string, dto: CreateTemplateVersionDto) {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('模板不存在');
    }

    const attachment = dto.attachmentId
      ? await this.prisma.attachment.findFirst({
          where: {
            id: dto.attachmentId,
            ownerType: 'DocumentTemplate',
            ownerId: templateId,
            deletedAt: null,
          },
          select: { storagePath: true, fileExt: true },
        })
      : null;
    if (dto.attachmentId && !attachment) {
      throw new NotFoundException('模板附件不存在');
    }
    const storagePath = attachment?.storagePath ?? dto.storagePath;
    if (!storagePath) {
      throw new BadRequestException('请先上传模板文件');
    }

    const version = await this.prisma.documentTemplateVersion.create({
      data: {
        templateId,
        versionNo: dto.versionNo,
        storagePath,
        changeNotes: dto.changeNotes,
      },
    });

    await this.prisma.documentTemplate.update({
      where: { id: templateId },
      data: {
        storagePath,
        ...(attachment?.fileExt && { fileFormat: attachment.fileExt }),
      },
    });

    return version;
  }

  async publish(templateId: string, userId: string) {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('模板不存在');
    }

    if (template.status === 'Published') {
      throw new BadRequestException('模板已发布');
    }

    if (template.status === 'Reviewing') {
      throw new BadRequestException('模板已提交审批，请等待处理');
    }

    await this.approvalService.startBusinessApproval({
      businessType: 'template',
      businessId: templateId,
      businessTitle: `文档模板发布：${template.name}`,
      applicantId: userId,
    });

    return this.prisma.documentTemplate.findUnique({ where: { id: templateId } });
  }

  async getDownloadInfo(templateId: string) {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, templateNo: true, name: true, status: true },
    });
    if (!template) throw new NotFoundException('模板不存在');
    if (template.status !== 'Published') {
      throw new BadRequestException('仅已发布模板可供下载');
    }
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        ownerType: 'DocumentTemplate',
        ownerId: templateId,
        deletedAt: null,
      },
      select: {
        id: true,
        originalName: true,
        fileExt: true,
        fileSize: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!attachment) {
      return {
        attachmentId: null,
        fileName: `${template.name}.md`,
        fileExt: 'md',
        fileSize: null,
        createdAt: new Date(),
        generatedContent: [
          `# ${template.name}`,
          '',
          `模板编号：${template.templateNo}`,
          '',
          '## 基本信息',
          '',
          '- 项目名称：',
          '- 项目编号：',
          '- 编制人：',
          '- 编制日期：',
          '',
          '## 正文',
          '',
          '请根据项目实际情况填写，并在提交前完成版本和审核信息确认。',
        ].join('\n'),
      };
    }
    return {
      attachmentId: attachment.id,
      fileName: attachment.originalName,
      fileExt: attachment.fileExt,
      fileSize: attachment.fileSize.toString(),
      createdAt: attachment.createdAt,
      generatedContent: null,
    };
  }
}
