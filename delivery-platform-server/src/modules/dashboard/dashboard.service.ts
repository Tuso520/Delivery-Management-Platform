import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
export interface DashboardOverview {
  totalProjects: number;
  activeProjects: number;
  highRiskProjects: number;
  delayedProjects: number;
  pendingReviews: number;
  avgCompletionRate: number;
  byStatus: { status: string; count: number }[];
  byStage: { stage: string; count: number }[];
  acceptedProjects: number;
  draftProjects: number;
  totalContractAmount: number;
  totalPlannedPaymentAmount: number;
  totalReceivedAmount: number;
  outstandingPaymentAmount: number;
  overduePaymentAmount: number;
  overduePaymentCount: number;
  paymentCompletionRate: number;
  recentProjects: {
    id: string;
    projectCode: string;
    projectName: string;
    countryCode: string;
    status: string;
    riskLevel: string;
    createdAt: string;
  }[];
}
export interface CountryStats {
  countryCode: string;
  totalProjects: number;
  activeProjects: number;
  completionRate: number;
}
export interface ProjectStats {
  projectId: string;
  projectName: string;
  projectCode: string;
  status: string;
  riskLevel: string;
  totalArchiveItems: number;
  completedArchiveItems: number;
  pendingUploadItems: number;
  reviewingItems: number;
  rejectedItems: number;
  totalChecklistItems: number;
  completedChecklistItems: number;
  pendingChecklistItems: number;
  totalFiles: number;
  memberCount: number;
}
export interface TodoItem {
  type: 'pending_upload' | 'pending_review' | 'rejected';
  id: string;
  projectId: string;
  projectName: string;
  itemName: string;
  stageCode: string;
  status: string;
  createdAt: Date;
}
export interface UserProject {
  id: string;
  projectCode: string;
  projectName: string;
  countryCode: string;
  projectStatus: string;
  riskLevel: string;
  currentStage: string;
  role: string;
}
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}
  async getOverview(userId: string): Promise<DashboardOverview> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    const roles = user?.userRoles.map((ur) => ur.role.roleCode) ?? [];
    const isGlobalViewer = roles.some((r) =>
      ['SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER'].includes(r),
    );
    const projectWhere: Prisma.ProjectWhereInput = {
      deletedAt: null,
      ...(isGlobalViewer
        ? {}
        : {
            members: { some: { userId } },
          }),
    };
    const projectIds = isGlobalViewer
      ? null
      : (
          await this.prisma.projectMember.findMany({
            where: { userId },
            select: { projectId: true },
          })
        ).map((m) => m.projectId);
    const [statsRow, recentProjectsRaw] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        Array<{
          totalProjects: bigint;
          activeProjects: bigint;
          highRiskProjects: bigint;
          delayedProjects: bigint;
          acceptedProjects: bigint;
          draftProjects: bigint;
          totalContractAmount: number;
        }>
      >(
        `SELECT
          COUNT(*) as totalProjects,
          SUM(CASE WHEN project_status = 'Active' THEN 1 ELSE 0 END) as activeProjects,
          SUM(CASE WHEN risk_level IN ('High', 'Critical') THEN 1 ELSE 0 END) as highRiskProjects,
          SUM(CASE WHEN project_status = 'Delayed' THEN 1 ELSE 0 END) as delayedProjects,
          SUM(CASE WHEN project_status = 'Accepted' THEN 1 ELSE 0 END) as acceptedProjects,
          SUM(CASE WHEN project_status = 'Draft' THEN 1 ELSE 0 END) as draftProjects,
          COALESCE(SUM(converted_amount), 0) as totalContractAmount
        FROM projects
        WHERE deleted_at IS NULL${
          isGlobalViewer
            ? ''
            : projectIds && projectIds.length > 0
              ? ` AND id IN (${projectIds.map(() => '?').join(',')})`
              : ' AND 1=0'
        }`,
        ...(isGlobalViewer ? [] : projectIds || []),
      ),
      this.prisma.project.findMany({
        where: projectWhere,
        select: {
          id: true,
          projectCode: true,
          projectName: true,
          countryCode: true,
          projectStatus: true,
          riskLevel: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);
    const row = statsRow[0] || {
      totalProjects: 0n,
      activeProjects: 0n,
      highRiskProjects: 0n,
      delayedProjects: 0n,
      acceptedProjects: 0n,
      draftProjects: 0n,
      totalContractAmount: 0,
    };
    const byStatusRaw = await this.prisma.project.groupBy({
      by: ['projectStatus'],
      where: projectWhere,
      _count: { id: true },
    });
    const byStageRaw = await this.prisma.project.groupBy({
      by: ['currentStage'],
      where: projectWhere,
      _count: { id: true },
    });
    const archiveItemWhere: Prisma.ProjectArchiveItemWhereInput = {
      status: 'Reviewing',
      ...(isGlobalViewer
        ? {}
        : projectIds && projectIds.length > 0
          ? { projectId: { in: projectIds } }
          : { projectId: { in: [] } }),
    };
    const pendingReviews = await this.prisma.projectArchiveItem.count({
      where: archiveItemWhere,
    });
    const archiveStatsScope: Prisma.ProjectArchiveItemWhereInput = isGlobalViewer
      ? {}
      : projectIds && projectIds.length > 0
        ? { projectId: { in: projectIds } }
        : { projectId: { in: [] } };
    const archiveStats = await this.prisma.projectArchiveItem.groupBy({
      by: ['projectId'],
      where: archiveStatsScope,
      _count: { id: true },
    });
    const completedArchiveStats = await this.prisma.projectArchiveItem.groupBy({
      by: ['projectId'],
      where: {
        ...archiveStatsScope,
        status: { in: ['Approved', 'Archived'] },
      },
      _count: { id: true },
    });
    const completedMap = new Map(
      completedArchiveStats.map((s) => [s.projectId, s._count.id]),
    );
    let totalItemCount = 0;
    let completedItemCount = 0;
    for (const stat of archiveStats) {
      totalItemCount += stat._count.id;
      completedItemCount += completedMap.get(stat.projectId) || 0;
    }
    const avgCompletionRate =
      totalItemCount > 0 ? Math.round((completedItemCount / totalItemCount) * 100) : 0;
    const byStatus = byStatusRaw.map((s) => ({
      status: s.projectStatus,
      count: s._count.id,
    }));
    const paymentWhere: Prisma.ProjectPaymentWhereInput = {
      deletedAt: null,
      project: projectWhere,
    };
    const [paymentAggregate, overduePaymentAggregate, overduePaymentCount] =
      await Promise.all([
        this.prisma.projectPayment.aggregate({
          where: paymentWhere,
          _sum: {
            convertedAmount: true,
            receivedConvertedAmount: true,
          },
        }),
        this.prisma.projectPayment.aggregate({
          where: {
            ...paymentWhere,
            status: 'Overdue',
          },
          _sum: { convertedAmount: true, receivedConvertedAmount: true },
        }),
        this.prisma.projectPayment.count({
          where: { ...paymentWhere, status: 'Overdue' },
        }),
      ]);
    const totalPlannedPaymentAmount =
      paymentAggregate._sum.convertedAmount?.toNumber() ?? 0;
    const totalReceivedAmount =
      paymentAggregate._sum.receivedConvertedAmount?.toNumber() ?? 0;
    const outstandingPaymentAmount = Math.max(
      totalPlannedPaymentAmount - totalReceivedAmount,
      0,
    );
    const overduePaymentAmount = Math.max(
      (overduePaymentAggregate._sum.convertedAmount?.toNumber() ?? 0) -
        (overduePaymentAggregate._sum.receivedConvertedAmount?.toNumber() ?? 0),
      0,
    );
    const byStage = byStageRaw.map((item) => ({
      stage: item.currentStage ?? 'Unassigned',
      count: item._count.id,
    }));
    const recentProjects = recentProjectsRaw.map((p) => ({
      id: p.id,
      projectCode: p.projectCode,
      projectName: p.projectName,
      countryCode: p.countryCode,
      status: p.projectStatus,
      riskLevel: p.riskLevel,
      createdAt: p.createdAt.toISOString(),
    }));
    return {
      totalProjects: Number(row.totalProjects),
      activeProjects: Number(row.activeProjects),
      highRiskProjects: Number(row.highRiskProjects),
      delayedProjects: Number(row.delayedProjects),
      pendingReviews,
      avgCompletionRate,
      byStatus,
      byStage,
      acceptedProjects: Number(row.acceptedProjects),
      draftProjects: Number(row.draftProjects),
      totalContractAmount: Number(row.totalContractAmount) || 0,
      totalPlannedPaymentAmount,
      totalReceivedAmount,
      outstandingPaymentAmount,
      overduePaymentAmount,
      overduePaymentCount,
      paymentCompletionRate:
        totalPlannedPaymentAmount > 0
          ? Math.round((totalReceivedAmount / totalPlannedPaymentAmount) * 100)
          : 0,
      recentProjects,
    };
  }
  async getCountryStats(countryCode: string, userId: string): Promise<CountryStats> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    const roles = user?.userRoles.map((ur) => ur.role.roleCode) ?? [];
    const isGlobalViewer = roles.some((r) =>
      ['SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER'].includes(r),
    );
    const projectIds = isGlobalViewer
      ? null
      : (
          await this.prisma.projectMember.findMany({
            where: { userId },
            select: { projectId: true },
          })
        ).map((m) => m.projectId);
    const projectScope = {
      deletedAt: null,
      countryCode,
      ...(isGlobalViewer
        ? {}
        : projectIds && projectIds.length > 0
          ? { id: { in: projectIds } }
          : { id: { in: [] } }),
    };
    const archiveItemScope = isGlobalViewer
      ? { project: { deletedAt: null, countryCode } }
      : projectIds && projectIds.length > 0
        ? { projectId: { in: projectIds }, project: { deletedAt: null, countryCode } }
        : {
            projectId: { in: [] },
            project: { deletedAt: null, countryCode },
          };
    const [totalProjects, activeProjects, totalItemCount, completedItemCount] =
      await Promise.all([
        this.prisma.project.count({ where: projectScope }),
        this.prisma.project.count({
          where: { ...projectScope, projectStatus: 'Active' },
        }),
        this.prisma.projectArchiveItem.count({ where: archiveItemScope }),
        this.prisma.projectArchiveItem.count({
          where: {
            ...archiveItemScope,
            status: { in: ['Approved', 'Archived', 'NotApplicable'] },
          },
        }),
      ]);
    const completionRate =
      totalItemCount > 0
        ? Math.round((completedItemCount / totalItemCount) * 100)
        : 0;
    return {
      countryCode,
      totalProjects,
      activeProjects,
      completionRate,
    };
  }
  async getProjectStats(projectId: string, userId: string): Promise<ProjectStats | null> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!project) {
      return null;
    }
    await this.checkProjectAccess(projectId, userId);
    const [
      totalArchiveItems,
      completedArchiveItems,
      pendingUploadItems,
      reviewingItems,
      rejectedItems,
      totalChecklistItems,
      completedChecklistItems,
      pendingChecklistItems,
      totalFiles,
      memberCount,
    ] = await Promise.all([
      this.prisma.projectArchiveItem.count({ where: { projectId } }),
      this.prisma.projectArchiveItem.count({
        where: { projectId, status: { in: ['Approved', 'Archived'] } },
      }),
      this.prisma.projectArchiveItem.count({
        where: { projectId, status: 'PendingUpload' },
      }),
      this.prisma.projectArchiveItem.count({
        where: { projectId, status: 'Reviewing' },
      }),
      this.prisma.projectArchiveItem.count({
        where: { projectId, status: 'Rejected' },
      }),
      this.prisma.projectChecklistItem.count({ where: { projectId } }),
      this.prisma.projectChecklistItem.count({
        where: { projectId, status: { in: ['Approved', 'Closed'] } },
      }),
      this.prisma.projectChecklistItem.count({
        where: { projectId, status: 'Pending' },
      }),
      this.prisma.file.count({ where: { projectId } }),
      this.prisma.projectMember.count({ where: { projectId } }),
    ]);
    return {
      projectId: project.id,
      projectName: project.projectName,
      projectCode: project.projectCode,
      status: project.projectStatus,
      riskLevel: project.riskLevel,
      totalArchiveItems,
      completedArchiveItems,
      pendingUploadItems,
      reviewingItems,
      rejectedItems,
      totalChecklistItems,
      completedChecklistItems,
      pendingChecklistItems,
      totalFiles,
      memberCount,
    };
  }
  async getMyTodos(userId: string): Promise<TodoItem[]> {
    const [pendingUploads, pendingReviews, rejectedItems] = await Promise.all([
      this.prisma.projectArchiveItem.findMany({
        where: {
          responsibleUserId: userId,
          status: 'PendingUpload',
          project: { deletedAt: null },
        },
        select: {
          id: true,
          name: true,
          stageCode: true,
          status: true,
          createdAt: true,
          project: { select: { id: true, projectName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.projectArchiveItem.findMany({
        where: {
          reviewUserId: userId,
          status: 'Reviewing',
          project: { deletedAt: null },
        },
        select: {
          id: true,
          name: true,
          stageCode: true,
          status: true,
          createdAt: true,
          project: { select: { id: true, projectName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.projectArchiveItem.findMany({
        where: {
          responsibleUserId: userId,
          status: 'Rejected',
          project: { deletedAt: null },
        },
        select: {
          id: true,
          name: true,
          stageCode: true,
          status: true,
          createdAt: true,
          project: { select: { id: true, projectName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const todos: TodoItem[] = [
      ...pendingUploads.map((item) => ({
        type: 'pending_upload' as const,
        id: item.id,
        projectId: item.project.id,
        projectName: item.project.projectName,
        itemName: item.name,
        stageCode: item.stageCode,
        status: item.status,
        createdAt: item.createdAt,
      })),
      ...pendingReviews.map((item) => ({
        type: 'pending_review' as const,
        id: item.id,
        projectId: item.project.id,
        projectName: item.project.projectName,
        itemName: item.name,
        stageCode: item.stageCode,
        status: item.status,
        createdAt: item.createdAt,
      })),
      ...rejectedItems.map((item) => ({
        type: 'rejected' as const,
        id: item.id,
        projectId: item.project.id,
        projectName: item.project.projectName,
        itemName: item.name,
        stageCode: item.stageCode,
        status: item.status,
        createdAt: item.createdAt,
      })),
    ];
    return todos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 50);
  }
  async getMyProjects(userId: string): Promise<UserProject[]> {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId, project: { deletedAt: null } },
      select: {
        projectRole: true,
        project: {
          select: {
            id: true,
            projectCode: true,
            projectName: true,
            countryCode: true,
            projectStatus: true,
            riskLevel: true,
            currentStage: true,
          },
        },
      },
      orderBy: { project: { createdAt: 'desc' } },
    });
    return memberships.map((m) => ({
      id: m.project.id,
      projectCode: m.project.projectCode,
      projectName: m.project.projectName,
      countryCode: m.project.countryCode,
      projectStatus: m.project.projectStatus,
      riskLevel: m.project.riskLevel,
      currentStage: m.project.currentStage ?? '',
      role: m.projectRole,
    }));
  }
  private async checkProjectAccess(projectId: string, userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    const roles = user?.userRoles.map((ur) => ur.role.roleCode) ?? [];
    const isElevated = roles.some((r) =>
      ['SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER'].includes(r),
    );
    if (isElevated) return;
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) {
      throw new NotFoundException('项目不存在');
    }
  }
}
