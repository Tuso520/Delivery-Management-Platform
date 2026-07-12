import { Prisma, RiskLevel } from '@prisma/client';

import type { PrismaService } from '../../../database/prisma.service';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import type { DataScopeService } from '../../identity/data-scope/data-scope.service';
import { DashboardService } from '../dashboard.service';

describe('DashboardService target contract', () => {
  const actor: Pick<JwtPayload, 'sub' | 'permissions' | 'roles'> = {
    sub: 'user-1',
    roles: ['PROJECT_MANAGER'],
    permissions: ['dashboard:view'],
  };
  const projectScope: Prisma.ProjectWhereInput = {
    deletedAt: null,
    members: { some: { userId: 'user-1' } },
  };

  function createService() {
    const prisma = {
      project: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      reviewTask: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { findMany: jest.fn().mockResolvedValue([]) },
      archiveTemplateVersion: { findMany: jest.fn().mockResolvedValue([]) },
      standardVersion: { findMany: jest.fn().mockResolvedValue([]) },
      knowledgeVersion: { findMany: jest.fn().mockResolvedValue([]) },
      operationLog: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const dataScope = {
      buildProjectWhere: jest.fn().mockResolvedValue(projectScope),
    } as unknown as DataScopeService;
    return {
      prisma,
      dataScope,
      service: new DashboardService(prisma, dataScope),
    };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calculates the four project indicators only inside DataScope', async () => {
    const { prisma, dataScope, service } = createService();
    jest
      .spyOn(prisma.project, 'count')
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);

    await expect(service.getProjectSummary(actor)).resolves.toEqual({
      total: 12,
      active: 7,
      accepted: 3,
      highRisk: 2,
    });
    expect(dataScope.buildProjectWhere).toHaveBeenCalledWith('user-1');
    expect(prisma.project.count).toHaveBeenNthCalledWith(1, {
      where: projectScope,
    });
    expect(prisma.project.count).toHaveBeenNthCalledWith(4, {
      where: {
        AND: [projectScope, { riskLevel: { in: [RiskLevel.High, RiskLevel.Critical] } }],
      },
    });
  });

  it('builds personal tasks from active assignments, actionable rejections, project reminders and unread system notifications', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-11T08:00:00.000Z'));
    const { prisma, service } = createService();
    jest
      .spyOn(prisma.reviewTask, 'findMany')
      .mockResolvedValueOnce([
        {
          id: 'review-1',
          title: '审核实施计划',
          locationLabel: '项目档案 / 实施计划',
          sourceType: 'PROJECT_ARCHIVE',
          sourceId: 'archive-file-1',
          projectId: 'project-1',
          project: { projectName: '越南项目' },
          submittedAt: new Date('2026-07-11T07:00:00.000Z'),
          dueAt: new Date('2026-07-11T07:30:00.000Z'),
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'rejected-1',
          title: '修订标准版本',
          locationLabel: '标准库 / 软件标准',
          sourceType: 'STANDARD',
          sourceId: 'standard-version-1',
          projectId: null,
          project: null,
          fileVersion: { status: 'REJECTED' },
          completedAt: new Date('2026-07-11T06:00:00.000Z'),
          submittedAt: new Date('2026-07-10T06:00:00.000Z'),
        },
      ] as never);
    jest.spyOn(prisma.project, 'findMany').mockResolvedValueOnce([
      {
        id: 'project-1',
        projectName: '越南项目',
        projectCode: 'VN-001',
        riskLevel: RiskLevel.Critical,
        riskDescription: '设备交期风险',
        currentStage: 'CONSTRUCTION',
        plannedEndDate: new Date('2026-07-10T00:00:00.000Z'),
        expectedAcceptanceAt: null,
        updatedAt: new Date('2026-07-11T05:00:00.000Z'),
      },
    ] as never);
    jest
      .spyOn(prisma.standardVersion, 'findMany')
      .mockResolvedValue([{ id: 'standard-version-1' }] as never);
    jest.spyOn(prisma.notification, 'findMany').mockResolvedValue([
      {
        id: 'notification-1',
        title: '系统维护提醒',
        content: '今晚将进行例行维护',
        notificationType: 'SYSTEM',
        relatedType: 'system',
        relatedId: null,
        createdAt: new Date('2026-07-11T04:00:00.000Z'),
      },
    ] as never);

    const result = await service.getMyTasks(actor);

    expect(result.map(({ type }) => type)).toEqual([
      'FILE_REVIEW',
      'PROJECT_RISK',
      'PROJECT_STAGE',
      'FILE_REVISION',
      'SYSTEM_NOTIFICATION',
    ]);
    expect(result[0]).toEqual(expect.objectContaining({ priority: 'URGENT' }));
    expect(prisma.reviewTask.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: [{ projectId: null }, { project: projectScope }],
            }),
          ]),
        }),
      }),
    );
  });

  it('drops stale rejected tasks and notifications that point to hidden projects', async () => {
    const { prisma, service } = createService();
    jest
      .spyOn(prisma.reviewTask, 'findMany')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'old-rejection',
          title: '旧驳回',
          locationLabel: null,
          sourceType: 'PROJECT_ARCHIVE',
          sourceId: 'archive-file-1',
          projectId: 'project-1',
          project: { projectName: '可见项目' },
          fileVersion: { status: 'APPROVED' },
          completedAt: new Date(),
          submittedAt: new Date(),
        },
      ] as never);
    jest.spyOn(prisma.project, 'findMany').mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    jest.spyOn(prisma.notification, 'findMany').mockResolvedValue([
      {
        id: 'hidden-notification',
        title: '隐藏项目通知',
        content: '不应返回',
        notificationType: 'PROJECT',
        relatedType: 'project',
        relatedId: 'hidden-project',
        createdAt: new Date(),
      },
    ] as never);

    await expect(service.getMyTasks(actor)).resolves.toEqual([]);
  });

  it('returns high risks and recent projects from the scoped project query', async () => {
    const { prisma, service } = createService();
    const updatedAt = new Date('2026-07-11T08:00:00.000Z');
    jest
      .spyOn(prisma.project, 'findMany')
      .mockResolvedValueOnce([
        {
          id: 'project-1',
          projectCode: 'VN-001',
          projectName: '越南项目',
          riskLevel: RiskLevel.High,
          riskDescription: '设备延期',
          currentStage: 'CONSTRUCTION',
          status: 'ACTIVE',
          expectedAcceptanceAt: null,
          updatedAt,
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'project-1',
          projectCode: 'VN-001',
          projectName: '越南项目',
          countryCode: 'VN',
          status: 'ACTIVE',
          riskLevel: RiskLevel.High,
          currentStage: 'CONSTRUCTION',
          progressPercent: new Prisma.Decimal(62.5),
          updatedAt,
        },
      ] as never);

    await expect(service.getHighRisks(actor)).resolves.toEqual([
      expect.objectContaining({
        id: 'project-1',
        status: 'ACTIVE',
        currentStage: 'CONSTRUCTION',
      }),
    ]);
    await expect(service.getRecentProjects(actor)).resolves.toEqual([
      expect.objectContaining({
        id: 'project-1',
        progressPercent: 62.5,
        updatedAt: updatedAt.toISOString(),
      }),
    ]);
    expect(prisma.project.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          AND: [
            projectScope,
            { archivedAt: null },
            { riskLevel: { in: [RiskLevel.High, RiskLevel.Critical] } },
          ],
        },
      }),
    );
    expect(prisma.project.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { AND: [projectScope, { archivedAt: null }] },
        orderBy: { updatedAt: 'desc' },
      }),
    );
  });

  it('sanitizes recent activity and excludes candidate logs from hidden projects', async () => {
    const { prisma, service } = createService();
    jest.spyOn(prisma.operationLog, 'findMany').mockResolvedValue([
      {
        id: 'activity-visible',
        module: 'project',
        action: 'stage_update',
        targetId: 'project-visible',
        createdAt: new Date('2026-07-11T08:00:00.000Z'),
        user: { realName: '项目经理', username: 'pm' },
      },
      {
        id: 'activity-hidden',
        module: 'project',
        action: 'update',
        targetId: 'project-hidden',
        createdAt: new Date('2026-07-11T07:00:00.000Z'),
        user: { realName: '其他用户', username: 'other' },
      },
    ] as never);
    jest
      .spyOn(prisma.project, 'findMany')
      .mockResolvedValue([{ id: 'project-visible', projectName: '可见项目' }] as never);

    const result = await service.getRecentActivities(actor);

    expect(result).toEqual([
      {
        id: 'activity-visible',
        module: 'project',
        action: 'stage_update',
        projectId: 'project-visible',
        projectName: '可见项目',
        actorName: '项目经理',
        occurredAt: '2026-07-11T08:00:00.000Z',
      },
    ]);
    expect(result[0]).not.toHaveProperty('beforeData');
    expect(result[0]).not.toHaveProperty('afterData');
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: {
        AND: [projectScope, { id: { in: ['project-visible', 'project-hidden'] } }],
      },
      select: { id: true, projectName: true },
    });
  });
});
