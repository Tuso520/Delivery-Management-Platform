import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ProjectAccessService } from '../project/project-access.service';

import {
  CreateProjectPaymentDto,
  QueryProjectPaymentDto,
  UpdateProjectPaymentDto,
} from './dto/project-payment.dto';

@Injectable()
export class ProjectPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async findAll(query: QueryProjectPaymentDto, userId: string) {
    const { page = 1, pageSize = 20, projectId, status } = query;
    const where: Prisma.ProjectPaymentWhereInput = {
      deletedAt: null,
      projectId,
      status,
      project: await this.projectAccess.buildProjectWhere(userId),
    };
    const [total, list] = await Promise.all([
      this.prisma.projectPayment.count({ where }),
      this.prisma.projectPayment.findMany({
        where,
        include: {
          project: {
            select: { id: true, projectCode: true, projectName: true },
          },
          creator: { select: { id: true, realName: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);
    return {
      list: list.map((item) => this.serialize(item)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async create(dto: CreateProjectPaymentDto, userId: string) {
    await this.projectAccess.assertProjectAccess(dto.projectId, userId);
    const amount = await this.resolveAmount(
      dto.originalAmount,
      dto.receivedOriginalAmount ?? 0,
      dto.originalCurrency,
      dto.convertedCurrency,
    );
    const record = await this.prisma.projectPayment.create({
      data: {
        projectId: dto.projectId,
        paymentName: dto.paymentName,
        paymentType: dto.paymentType ?? 'Milestone',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : undefined,
        status: this.resolveStatus(
          dto.originalAmount,
          dto.receivedOriginalAmount ?? 0,
          dto.dueDate,
        ),
        ...amount,
        remark: dto.remark,
        createdBy: userId,
      },
    });
    return this.serialize(record);
  }

  async update(id: string, dto: UpdateProjectPaymentDto, userId: string) {
    const existing = await this.prisma.projectPayment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('回款记录不存在');
    await this.projectAccess.assertProjectAccess(existing.projectId, userId);
    if (dto.projectId && dto.projectId !== existing.projectId) {
      throw new BadRequestException('不能修改回款记录所属项目');
    }
    const originalAmount =
      dto.originalAmount ?? existing.originalAmount.toNumber();
    const receivedOriginalAmount =
      dto.receivedOriginalAmount ?? existing.receivedOriginalAmount.toNumber();
    const originalCurrency = dto.originalCurrency ?? existing.originalCurrency;
    const convertedCurrency =
      dto.convertedCurrency ?? existing.convertedCurrency;
    const amount = await this.resolveAmount(
      originalAmount,
      receivedOriginalAmount,
      originalCurrency,
      convertedCurrency,
    );
    const dueDate =
      dto.dueDate === undefined
        ? existing.dueDate
        : dto.dueDate
          ? new Date(dto.dueDate)
          : null;
    const record = await this.prisma.projectPayment.update({
      where: { id },
      data: {
        paymentName: dto.paymentName,
        paymentType: dto.paymentType,
        dueDate,
        receivedDate: dto.receivedDate
          ? new Date(dto.receivedDate)
          : undefined,
        status: this.resolveStatus(
          originalAmount,
          receivedOriginalAmount,
          dueDate?.toISOString(),
        ),
        ...amount,
        remark: dto.remark,
      },
    });
    return this.serialize(record);
  }

  async remove(id: string, userId: string): Promise<void> {
    const existing = await this.prisma.projectPayment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('回款记录不存在');
    await this.projectAccess.assertProjectAccess(existing.projectId, userId);
    await this.prisma.projectPayment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async resolveAmount(
    originalAmountValue: number,
    receivedAmountValue: number,
    originalCurrency: string,
    convertedCurrency: string,
  ) {
    const originalAmount = new Prisma.Decimal(originalAmountValue);
    const receivedOriginalAmount = new Prisma.Decimal(receivedAmountValue);
    if (receivedOriginalAmount.gt(originalAmount)) {
      throw new BadRequestException('已回款金额不能大于应回款金额');
    }
    if (originalCurrency === convertedCurrency) {
      return {
        originalAmount,
        originalCurrency,
        exchangeRate: new Prisma.Decimal(1),
        convertedCurrency,
        convertedAmount: originalAmount,
        receivedOriginalAmount,
        receivedConvertedAmount: receivedOriginalAmount,
        rateDate: new Date(),
        rateSource: 'identity',
      };
    }
    const rate = await this.prisma.exchangeRate.findFirst({
      where: {
        fromCurrency: originalCurrency,
        toCurrency: convertedCurrency,
        rateDate: { lte: new Date() },
      },
      orderBy: { rateDate: 'desc' },
    });
    if (!rate) {
      throw new BadRequestException(
        `未配置 ${originalCurrency} 到 ${convertedCurrency} 的有效汇率`,
      );
    }
    return {
      originalAmount,
      originalCurrency,
      exchangeRate: rate.rate,
      convertedCurrency,
      convertedAmount: originalAmount.mul(rate.rate),
      receivedOriginalAmount,
      receivedConvertedAmount: receivedOriginalAmount.mul(rate.rate),
      rateDate: rate.rateDate,
      rateSource: rate.source,
    };
  }

  private resolveStatus(
    originalAmount: number,
    receivedAmount: number,
    dueDate?: string | null,
  ): string {
    if (receivedAmount >= originalAmount && originalAmount > 0) return 'Received';
    if (receivedAmount > 0) return 'PartiallyReceived';
    if (dueDate && new Date(dueDate).getTime() < Date.now()) return 'Overdue';
    return 'Planned';
  }

  private serialize<T extends {
    originalAmount: Prisma.Decimal;
    exchangeRate: Prisma.Decimal;
    convertedAmount: Prisma.Decimal;
    receivedOriginalAmount: Prisma.Decimal;
    receivedConvertedAmount: Prisma.Decimal;
  }>(record: T) {
    return {
      ...record,
      originalAmount: record.originalAmount.toNumber(),
      exchangeRate: record.exchangeRate.toNumber(),
      convertedAmount: record.convertedAmount.toNumber(),
      receivedOriginalAmount: record.receivedOriginalAmount.toNumber(),
      receivedConvertedAmount: record.receivedConvertedAmount.toNumber(),
    };
  }
}
