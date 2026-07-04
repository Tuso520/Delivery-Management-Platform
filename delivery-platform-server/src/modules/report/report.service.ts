import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { ApprovalService } from '../platform/approval.service';
import { ProjectAccessService } from '../project/project-access.service';

import { CreateReportDto } from './dto/create-report.dto';
import { QueryReportDto } from './dto/query-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';


interface ReportListItem {
  id: string;
  projectId: string;
  authorId: string;
  reportType: string;
  reportDate: Date;
  content: string;
  workHours: Decimal | null;
  projectProgress: string | null;
  paymentProgress: string | null;
  riskNotes: string | null;
  nextPlan: string | null;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author?: { id: string; realName: string };
  project?: { id: string; projectName: string; projectCode: string };
}

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: ApprovalService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async create(dto: CreateReportDto, authorId: string) {
    await this.projectAccess.assertProjectAccess(dto.projectId, authorId);
    return this.prisma.dailyReport.create({
      data: {
        projectId: dto.projectId,
        authorId,
        reportType: dto.reportType,
        reportDate: new Date(dto.reportDate),
        content: dto.content,
        workHours: dto.workHours ?? null,
        projectProgress: dto.projectProgress,
        paymentProgress: dto.paymentProgress,
        riskNotes: dto.riskNotes,
        nextPlan: dto.nextPlan,
      },
      include: {
        author: { select: { id: true, realName: true } },
        project: { select: { id: true, projectName: true, projectCode: true } },
      },
    });
  }

  async findAll(
    query: QueryReportDto,
    userId?: string,
  ): Promise<PaginatedResult<ReportListItem>> {
    const { page = 1, pageSize = 20, projectId, authorId, reportType, dateFrom, dateTo, status } = query;

    const where: Prisma.DailyReportWhereInput = { deletedAt: null };
    if (userId) {
      where.project = await this.projectAccess.buildProjectWhere(userId);
    }

    if (projectId) {
      where.projectId = projectId;
    }
    if (authorId) {
      where.authorId = authorId;
    }
    if (reportType) {
      where.reportType = reportType;
    }
    if (status) {
      where.status = status;
    }
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) {
        dateFilter.gte = new Date(dateFrom);
      }
      if (dateTo) {
        dateFilter.lte = new Date(dateTo);
      }
      where.reportDate = dateFilter;
    }

    const [total, list] = await Promise.all([
      this.prisma.dailyReport.count({ where }),
      this.prisma.dailyReport.findMany({
        where,
        include: {
          author: { select: { id: true, realName: true } },
          project: { select: { id: true, projectName: true, projectCode: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { reportDate: 'desc' },
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

  async findById(id: string, userId?: string) {
    const report = await this.prisma.dailyReport.findUnique({
      where: { id, deletedAt: null },
      include: {
        author: { select: { id: true, realName: true } },
        project: { select: { id: true, projectName: true, projectCode: true, projectManagerId: true } },
        reviewer: { select: { id: true, realName: true } },
      },
    });

    if (!report) {
      throw new NotFoundException('报告不存在');
    }
    if (userId) {
      await this.projectAccess.assertProjectAccess(report.projectId, userId);
    }

    return report;
  }

  async update(id: string, dto: UpdateReportDto, userId: string) {
    const report = await this.prisma.dailyReport.findFirst({
      where: { id, deletedAt: null },
    });

    if (!report) {
      throw new NotFoundException('报告不存在');
    }

    if (report.authorId !== userId) {
      throw new ForbiddenException('只能编辑自己的报告');
    }

    if (report.status === 'Reviewed') {
      throw new BadRequestException('已审核的报告不能编辑');
    }

    return this.prisma.dailyReport.update({
      where: { id },
      data: {
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.workHours !== undefined && { workHours: dto.workHours }),
        ...(dto.projectProgress !== undefined && { projectProgress: dto.projectProgress }),
        ...(dto.paymentProgress !== undefined && { paymentProgress: dto.paymentProgress }),
        ...(dto.riskNotes !== undefined && { riskNotes: dto.riskNotes }),
        ...(dto.nextPlan !== undefined && { nextPlan: dto.nextPlan }),
      },
      include: {
        author: { select: { id: true, realName: true } },
        project: { select: { id: true, projectName: true, projectCode: true } },
      },
    });
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const report = await this.prisma.dailyReport.findFirst({ where: { id, deletedAt: null } });

    if (!report) {
      throw new NotFoundException('报告不存在');
    }

    if (report.authorId !== userId) {
      throw new ForbiddenException('只能删除自己的报告');
    }

    await this.prisma.dailyReport.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async submit(id: string, userId: string) {
    const report = await this.prisma.dailyReport.findFirst({
      where: { id, deletedAt: null },
      include: {
        project: {
          select: { projectCode: true, countryCode: true },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('报告不存在');
    }

    if (report.authorId !== userId) {
      throw new ForbiddenException('只能提交自己的报告');
    }
    await this.projectAccess.assertProjectAccess(report.projectId, userId);

    if (report.status !== 'Draft') {
      throw new BadRequestException('只能提交草稿状态的报告');
    }

    const reportTypeLabel: Record<string, string> = {
      daily: '日报',
      weekly: '周报',
      monthly: '月报',
    };
    return this.approvalService.startBusinessApproval({
      businessType: 'report',
      businessId: report.id,
      businessTitle: `${report.project.projectCode} ${
        reportTypeLabel[report.reportType] ?? report.reportType
      } ${report.reportDate.toISOString().slice(0, 10)}`,
      applicantId: userId,
      countryCode: report.project.countryCode,
    });
  }

  async review(id: string, userId: string) {
    const report = await this.prisma.dailyReport.findFirst({ where: { id, deletedAt: null } });

    if (!report) {
      throw new NotFoundException('报告不存在');
    }

    if (report.status !== 'Submitted') {
      throw new BadRequestException('只能审核已提交的报告');
    }

    return this.approvalService.decideBusinessTask(
      'report',
      id,
      { decision: 'Approved', comment: '报告审核通过' },
      userId,
    );
  }

  async getMyReports(query: QueryReportDto, userId: string): Promise<PaginatedResult<ReportListItem>> {
    return this.findAll({ ...query, authorId: userId }, userId);
  }

  async getProjectSummary(projectId: string, userId: string) {
    await this.projectAccess.assertProjectAccess(projectId, userId);
    // Get last 4 weeks of reports for this project
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const reports = await this.prisma.dailyReport.findMany({
      where: {
        projectId,
        reportDate: { gte: fourWeeksAgo },
        status: { in: ['Submitted', 'Reviewed'] },
      },
      include: {
        author: { select: { id: true, realName: true } },
      },
      orderBy: { reportDate: 'desc' },
      take: 20,
    });

    // Count weekly report count
    const weeklyCount = await this.prisma.dailyReport.count({
      where: {
        projectId,
        reportType: 'weekly',
        reportDate: { gte: fourWeeksAgo },
        status: { in: ['Submitted', 'Reviewed'] },
      },
    });

    // Get latest progress
    const latestReports = await this.prisma.dailyReport.findMany({
      where: {
        projectId,
        reportDate: { gte: fourWeeksAgo },
        status: { in: ['Submitted', 'Reviewed'] },
      },
      orderBy: { reportDate: 'desc' },
      take: 5,
      select: {
        reportDate: true,
        projectProgress: true,
        paymentProgress: true,
        riskNotes: true,
      },
    });

    return {
      reports,
      weeklyCount,
      latestProgress: latestReports,
      summary: '最近4周项目进度概览',
    };
  }
}
