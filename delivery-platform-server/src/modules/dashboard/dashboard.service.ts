import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, RiskLevel } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { DataScopeService } from '../identity/data-scope/data-scope.service';

import {
  type DashboardTaskDto,
  type HighRiskProjectDto,
  type ProjectSummaryDto,
  type RecentActivityDto,
  type RecentProjectDto,
} from './dto/dashboard-response.dto';

type DashboardActor = Pick<JwtPayload, 'sub' | 'permissions' | 'roles'>;

const ACTIVE_PROJECT_FILTER: Prisma.ProjectWhereInput = {
  status: 'ACTIVE',
  archivedAt: null,
};

const ACCEPTED_PROJECT_FILTER: Prisma.ProjectWhereInput = {
  actualAcceptanceAt: { not: null },
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScope: DataScopeService,
  ) {}

  async getProjectSummary(actor: DashboardActor): Promise<ProjectSummaryDto> {
    const projectScope = await this.dataScope.buildProjectWhere(actor.sub);
    const [total, active, accepted, highRisk] = await Promise.all([
      this.prisma.project.count({ where: projectScope }),
      this.prisma.project.count({ where: { AND: [projectScope, ACTIVE_PROJECT_FILTER] } }),
      this.prisma.project.count({ where: { AND: [projectScope, ACCEPTED_PROJECT_FILTER] } }),
      this.prisma.project.count({
        where: {
          AND: [projectScope, { riskLevel: { in: [RiskLevel.High, RiskLevel.Critical] } }],
        },
      }),
    ]);

    return { total, active, accepted, highRisk };
  }

  async getMyTasks(actor: DashboardActor): Promise<DashboardTaskDto[]> {
    const now = new Date();
    const reminderThreshold = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const projectScope = await this.dataScope.buildProjectWhere(actor.sub);
    const reviewVisibility: Prisma.ReviewTaskWhereInput = {
      OR: [{ projectId: null }, { project: projectScope }],
    };
    const personalProjectScope: Prisma.ProjectWhereInput = {
      AND: [
        projectScope,
        {
          OR: [
            { members: { some: { userId: actor.sub, deletedAt: null } } },
            { createdBy: actor.sub },
            { salesOwnerId: actor.sub },
            { projectManagerId: actor.sub },
            { electricalOwnerId: actor.sub },
            { softwareOwnerId: actor.sub },
          ],
        },
      ],
    };

    const [pendingReviews, rejectedReviews, reminderProjects, unreadNotifications] =
      await Promise.all([
        this.prisma.reviewTask.findMany({
          where: {
            AND: [
              reviewVisibility,
              {
                status: 'PENDING',
                archivedAt: null,
                steps: {
                  some: {
                    status: 'ACTIVE',
                    assignees: {
                      some: { assigneeUserId: actor.sub, status: 'PENDING' },
                    },
                  },
                },
              },
            ],
          },
          select: {
            id: true,
            title: true,
            locationLabel: true,
            sourceType: true,
            sourceId: true,
            projectId: true,
            project: { select: { projectName: true } },
            submittedAt: true,
            dueAt: true,
          },
          orderBy: [{ dueAt: 'asc' }, { submittedAt: 'desc' }],
          take: 20,
        }),
        this.prisma.reviewTask.findMany({
          where: {
            AND: [
              reviewVisibility,
              { status: 'REJECTED', archivedAt: null, submittedBy: actor.sub },
            ],
          },
          select: {
            id: true,
            title: true,
            locationLabel: true,
            sourceType: true,
            sourceId: true,
            projectId: true,
            project: { select: { projectName: true } },
            fileVersion: { select: { status: true } },
            completedAt: true,
            submittedAt: true,
          },
          orderBy: { completedAt: 'desc' },
          take: 20,
        }),
        this.prisma.project.findMany({
          where: {
            AND: [
              personalProjectScope,
              { archivedAt: null },
              {
                OR: [
                  { riskLevel: { in: [RiskLevel.High, RiskLevel.Critical] } },
                  { plannedEndDate: { lte: reminderThreshold } },
                  { expectedAcceptanceAt: { lte: reminderThreshold } },
                ],
              },
              { status: { in: ['ACTIVE', 'PAUSED'] } },
            ],
          },
          select: {
            id: true,
            projectName: true,
            projectCode: true,
            riskLevel: true,
            riskDescription: true,
            currentStage: true,
            plannedEndDate: true,
            expectedAcceptanceAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: 15,
        }),
        this.prisma.notification.findMany({
          where: { userId: actor.sub, isRead: false },
          select: {
            id: true,
            title: true,
            content: true,
            notificationType: true,
            relatedType: true,
            relatedId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
      ]);

    const actionableRejected = await this.filterActionableRejectedReviews(rejectedReviews);
    const safeNotifications = await this.filterVisibleNotifications(
      unreadNotifications,
      projectScope,
    );

    const tasks: DashboardTaskDto[] = [
      ...pendingReviews.map((task) => ({
        id: task.id,
        type: 'FILE_REVIEW' as const,
        title: task.title,
        description: task.locationLabel,
        sourceType: task.sourceType,
        sourceId: task.sourceId,
        projectId: task.projectId,
        projectName: task.project?.projectName ?? null,
        priority: this.resolveTaskPriority(task.dueAt, now),
        dueAt: task.dueAt?.toISOString() ?? null,
        createdAt: task.submittedAt.toISOString(),
      })),
      ...actionableRejected.map((task) => ({
        id: task.id,
        type: 'FILE_REVISION' as const,
        title: task.title,
        description: task.locationLabel ?? '审核已驳回，请修改后重新提交',
        sourceType: task.sourceType,
        sourceId: task.sourceId,
        projectId: task.projectId,
        projectName: task.project?.projectName ?? null,
        priority: 'HIGH' as const,
        dueAt: null,
        createdAt: (task.completedAt ?? task.submittedAt).toISOString(),
      })),
      ...reminderProjects.flatMap((project) => {
        const projectTasks: DashboardTaskDto[] = [];
        if (project.riskLevel === RiskLevel.High || project.riskLevel === RiskLevel.Critical) {
          projectTasks.push({
            id: `risk:${project.id}`,
            type: 'PROJECT_RISK',
            title: `${project.projectName}存在${project.riskLevel === RiskLevel.Critical ? '严重' : '高'}风险`,
            description: project.riskDescription,
            sourceType: 'PROJECT',
            sourceId: project.id,
            projectId: project.id,
            projectName: project.projectName,
            priority: project.riskLevel === RiskLevel.Critical ? 'URGENT' : 'HIGH',
            dueAt: null,
            createdAt: project.updatedAt.toISOString(),
          });
        }
        const stageDueAt = this.earliestDate(project.plannedEndDate, project.expectedAcceptanceAt);
        if (stageDueAt && stageDueAt <= reminderThreshold) {
          projectTasks.push({
            id: `stage:${project.id}`,
            type: 'PROJECT_STAGE',
            title: `${project.projectName}阶段节点${stageDueAt < now ? '已逾期' : '即将到期'}`,
            description: `当前阶段：${this.requireProjectStage(project.currentStage, project.id)}`,
            sourceType: 'PROJECT',
            sourceId: project.id,
            projectId: project.id,
            projectName: project.projectName,
            priority: stageDueAt < now ? 'URGENT' : 'HIGH',
            dueAt: stageDueAt.toISOString(),
            createdAt: project.updatedAt.toISOString(),
          });
        }
        return projectTasks;
      }),
      ...safeNotifications.map((notification) => ({
        id: notification.id,
        type: 'SYSTEM_NOTIFICATION' as const,
        title: notification.title,
        description: notification.content,
        sourceType: notification.notificationType,
        sourceId: notification.relatedId,
        projectId:
          notification.relatedType?.toLowerCase() === 'project' ? notification.relatedId : null,
        projectName: null,
        priority: 'NORMAL' as const,
        dueAt: null,
        createdAt: notification.createdAt.toISOString(),
      })),
    ];

    return tasks
      .sort((left, right) => {
        const priority = { URGENT: 3, HIGH: 2, NORMAL: 1 } as const;
        return (
          priority[right.priority] - priority[left.priority] ||
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        );
      })
      .slice(0, 20);
  }

  async getHighRisks(actor: DashboardActor): Promise<HighRiskProjectDto[]> {
    const projectScope = await this.dataScope.buildProjectWhere(actor.sub);
    const projects = await this.prisma.project.findMany({
      where: {
        AND: [
          projectScope,
          { archivedAt: null },
          { riskLevel: { in: [RiskLevel.High, RiskLevel.Critical] } },
        ],
      },
      select: {
        id: true,
        projectCode: true,
        projectName: true,
        riskLevel: true,
        riskDescription: true,
        currentStage: true,
        status: true,
        expectedAcceptanceAt: true,
        updatedAt: true,
      },
      orderBy: [{ riskLevel: 'desc' }, { updatedAt: 'desc' }],
      take: 10,
    });

    return projects.map((project) => ({
      id: project.id,
      projectCode: project.projectCode,
      projectName: project.projectName,
      riskLevel: project.riskLevel,
      riskDescription: project.riskDescription,
      currentStage: this.requireProjectStage(project.currentStage, project.id),
      status: this.requireProjectStatus(project.status, project.id),
      expectedAcceptanceAt: project.expectedAcceptanceAt?.toISOString() ?? null,
      updatedAt: project.updatedAt.toISOString(),
    }));
  }

  async getRecentProjects(actor: DashboardActor): Promise<RecentProjectDto[]> {
    const projectScope = await this.dataScope.buildProjectWhere(actor.sub);
    const projects = await this.prisma.project.findMany({
      where: { AND: [projectScope, { archivedAt: null }] },
      select: {
        id: true,
        projectCode: true,
        projectName: true,
        countryCode: true,
        status: true,
        riskLevel: true,
        currentStage: true,
        progressPercent: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    });

    return projects.map((project) => ({
      id: project.id,
      projectCode: project.projectCode,
      projectName: project.projectName,
      countryCode: project.countryCode,
      status: this.requireProjectStatus(project.status, project.id),
      riskLevel: project.riskLevel,
      currentStage: this.requireProjectStage(project.currentStage, project.id),
      progressPercent: project.progressPercent?.toNumber() ?? null,
      updatedAt: project.updatedAt.toISOString(),
    }));
  }

  async getRecentActivities(actor: DashboardActor): Promise<RecentActivityDto[]> {
    const candidates = await this.prisma.operationLog.findMany({
      where: {
        targetType: { in: ['project', 'PROJECT', 'Project'] },
        result: 'success',
      },
      select: {
        id: true,
        module: true,
        action: true,
        targetId: true,
        createdAt: true,
        user: { select: { realName: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    if (candidates.length === 0) return [];

    const projectScope = await this.dataScope.buildProjectWhere(actor.sub);
    const projects = await this.prisma.project.findMany({
      where: {
        AND: [projectScope, { id: { in: candidates.map((item) => item.targetId) } }],
      },
      select: { id: true, projectName: true },
    });
    const visibleProjects = new Map(projects.map((project) => [project.id, project.projectName]));

    return candidates
      .flatMap((activity): RecentActivityDto[] => {
        const projectName = visibleProjects.get(activity.targetId);
        if (!projectName) return [];
        return [
          {
            id: activity.id,
            module: activity.module,
            action: activity.action,
            projectId: activity.targetId,
            projectName,
            actorName: activity.user.realName || activity.user.username,
            occurredAt: activity.createdAt.toISOString(),
          },
        ];
      })
      .slice(0, 10);
  }

  private async filterActionableRejectedReviews<
    T extends {
      sourceType: string;
      sourceId: string;
      fileVersion: { status: string } | null;
    },
  >(tasks: T[]): Promise<T[]> {
    const sourceIds = (sourceType: string) =>
      tasks.filter((task) => task.sourceType === sourceType).map((task) => task.sourceId);
    const [archiveTemplateVersions, standardVersions, knowledgeVersions] = await Promise.all([
      this.findRejectedIds('archiveTemplateVersion', sourceIds('ARCHIVE_TEMPLATE')),
      this.findRejectedIds('standardVersion', sourceIds('STANDARD')),
      this.findRejectedIds('knowledgeVersion', sourceIds('KNOWLEDGE')),
    ]);

    return tasks.filter((task) => {
      if (task.sourceType === 'PROJECT_ARCHIVE') {
        return task.fileVersion?.status === 'REJECTED';
      }
      if (task.sourceType === 'ARCHIVE_TEMPLATE') {
        return archiveTemplateVersions.has(task.sourceId);
      }
      if (task.sourceType === 'STANDARD') return standardVersions.has(task.sourceId);
      if (task.sourceType === 'KNOWLEDGE') return knowledgeVersions.has(task.sourceId);
      return false;
    });
  }

  private async findRejectedIds(
    model: 'archiveTemplateVersion' | 'standardVersion' | 'knowledgeVersion',
    ids: string[],
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    if (model === 'archiveTemplateVersion') {
      const rows = await this.prisma.archiveTemplateVersion.findMany({
        where: { id: { in: ids }, status: 'REJECTED' },
        select: { id: true },
      });
      return new Set(rows.map(({ id }) => id));
    }
    if (model === 'standardVersion') {
      const rows = await this.prisma.standardVersion.findMany({
        where: { id: { in: ids }, status: 'REJECTED' },
        select: { id: true },
      });
      return new Set(rows.map(({ id }) => id));
    }
    const rows = await this.prisma.knowledgeVersion.findMany({
      where: { id: { in: ids }, status: 'REJECTED' },
      select: { id: true },
    });
    return new Set(rows.map(({ id }) => id));
  }

  private async filterVisibleNotifications<
    T extends { relatedType: string | null; relatedId: string | null },
  >(notifications: T[], projectScope: Prisma.ProjectWhereInput): Promise<T[]> {
    const projectIds = notifications.flatMap((notification) =>
      notification.relatedType?.toLowerCase() === 'project' && notification.relatedId
        ? [notification.relatedId]
        : [],
    );
    const visibleProjectIds =
      projectIds.length === 0
        ? new Set<string>()
        : new Set(
            (
              await this.prisma.project.findMany({
                where: { AND: [projectScope, { id: { in: projectIds } }] },
                select: { id: true },
              })
            ).map(({ id }) => id),
          );

    return notifications.filter((notification) => {
      const relatedType = notification.relatedType?.toLowerCase();
      if (!relatedType || ['system', 'security', 'announcement'].includes(relatedType)) {
        return true;
      }
      return (
        relatedType === 'project' &&
        Boolean(notification.relatedId && visibleProjectIds.has(notification.relatedId))
      );
    });
  }

  private resolveTaskPriority(dueAt: Date | null, now: Date): DashboardTaskDto['priority'] {
    if (!dueAt) return 'NORMAL';
    if (dueAt <= now) return 'URGENT';
    return dueAt.getTime() - now.getTime() <= 24 * 60 * 60 * 1000 ? 'HIGH' : 'NORMAL';
  }

  private earliestDate(left: Date | null, right: Date | null): Date | null {
    if (!left) return right;
    if (!right) return left;
    return left <= right ? left : right;
  }

  private requireProjectStatus(value: string | null, projectId: string): string {
    if (value) return value;
    throw new BadRequestException(`项目 ${projectId} 尚未完成目标状态迁移`);
  }

  private requireProjectStage(value: string | null, projectId: string): string {
    if (value) return value;
    throw new BadRequestException(`项目 ${projectId} 尚未完成目标阶段迁移`);
  }
}
