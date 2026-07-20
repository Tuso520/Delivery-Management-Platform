import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { PrismaService } from '../../../database/prisma.service';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import type { ProjectArchiveSnapshotService } from '../../project-archive/project-archive-snapshot.service';
import type { ReviewConfigurationService } from '../../review/review-configuration.service';
import type { ReviewTaskService } from '../../review/review-task.service';
import type { SystemConfigService } from '../../system-config/system-config.service';
import type { CreateProjectDto } from '../dto/create-project.dto';
import type { ProjectAccessService } from '../project-access.service';
import type { ProjectConfigurationService } from '../project-configuration.service';
import { hashProjectCreateRequest } from '../project-create-idempotency';
import { ProjectService } from '../project.service';

describe('ProjectService', () => {
  const archiveTemplateId = 'archive-template-1';
  const idempotencyKey = 'project-create-key-0001';
  const publicActor: Pick<JwtPayload, 'sub' | 'permissions' | 'roles'> = {
    sub: 'user-1',
    roles: ['PROJECT_MANAGER'],
    permissions: ['project:view'],
  };
  const financialActor: Pick<JwtPayload, 'sub' | 'permissions' | 'roles'> = {
    ...publicActor,
    permissions: ['project:view', 'project:view_financial'],
  };
  const sensitiveActor: Pick<JwtPayload, 'sub' | 'permissions' | 'roles'> = {
    ...publicActor,
    permissions: [
      'project:view',
      'project:view_financial',
      'project:view_contract',
      'project:view_acceptance',
      'project:progress:update',
      'project:update',
    ],
  };
  const mockProject = {
    id: 'project-1',
    projectCode: 'VN-AC-2026-001',
    projectName: '测试项目',
    shortName: '测试',
    countryCode: 'VN',
    city: '河内',
    customerName: '测试客户',
    projectType: 'Network',
    contractCurrency: 'USD',
    baseCurrency: 'CNY',
    contractAmount: new Prisma.Decimal(100000),
    exchangeRate: new Prisma.Decimal(7.2),
    convertedAmount: new Prisma.Decimal(720000),
    exchangeRateDate: new Date('2026-06-24T00:00:00Z'),
    exchangeRateSource: 'CentralBank',
    projectLanguage: 'zh-CN',
    salesOwnerId: null,
    status: 'ACTIVE',
    currentStage: 'CONSTRUCTION',
    progressPercent: new Prisma.Decimal(40),
    riskLevel: 'Low',
    riskDescription: null,
    contractNo: 'CT-001',
    contractSignedAt: new Date('2026-06-20'),
    startDate: new Date('2026-07-01'),
    plannedEndDate: new Date('2026-12-31'),
    actualEndDate: null,
    expectedAcceptanceAt: new Date('2026-12-20'),
    actualAcceptanceAt: null,
    archivedAt: null,
    revision: 1,
    createdBy: 'user-1',
    createdAt: new Date('2026-06-22'),
    updatedAt: new Date('2026-06-22'),
    deletedAt: null,
    members: [],
  };

  let service: ProjectService;
  let prisma: {
    project: Record<string, jest.Mock>;
    projectMember: Record<string, jest.Mock>;
    projectArchiveFile: Record<string, jest.Mock>;
    file: Record<string, jest.Mock>;
    reviewTask: Record<string, jest.Mock>;
    projectPayment: Record<string, jest.Mock>;
    exchangeRate: Record<string, jest.Mock>;
    country: Record<string, jest.Mock>;
    operationLog: Record<string, jest.Mock>;
    projectProcessRecord: Record<string, jest.Mock>;
    outboxEvent: Record<string, jest.Mock>;
    approvalTemplate: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let projectAccess: {
    buildProjectWhere: jest.Mock;
    assertProjectAccess: jest.Mock;
  };
  let projectArchiveSnapshot: {
    createProjectSnapshot: jest.Mock;
  };
  let reviewConfiguration: { resolve: jest.Mock };
  let reviewTasks: {
    prepareTask: jest.Mock;
    createPreparedTask: jest.Mock;
    logPreparedTaskCreated: jest.Mock;
  };
  let systemConfig: {
    getDefaultProjectRiskLevel: jest.Mock;
    getDefaultProjectPageSize: jest.Mock;
  };
  let projectConfiguration: { validate: jest.Mock; validateUpdate: jest.Mock };

  beforeEach(() => {
    prisma = {
      project: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { convertedAmount: null } }),
      },
      projectMember: { upsert: jest.fn() },
      projectArchiveFile: { count: jest.fn().mockResolvedValue(0) },
      file: { count: jest.fn().mockResolvedValue(0) },
      reviewTask: { count: jest.fn().mockResolvedValue(0) },
      projectPayment: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { receivedConvertedAmount: null } }),
      },
      exchangeRate: { findFirst: jest.fn() },
      country: {
        findMany: jest.fn().mockResolvedValue([{ countryCode: 'VN', nameZh: '越南' }]),
      },
      operationLog: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      projectProcessRecord: { create: jest.fn() },
      outboxEvent: { create: jest.fn() },
      approvalTemplate: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (operation: (client: typeof prisma) => Promise<unknown>) => operation(prisma),
    );
    projectAccess = {
      buildProjectWhere: jest.fn().mockResolvedValue({ deletedAt: null }),
      assertProjectAccess: jest.fn().mockResolvedValue(undefined),
    };
    projectArchiveSnapshot = {
      createProjectSnapshot: jest.fn().mockResolvedValue({
        templateId: 'template-1',
        templateVersionId: 'template-version-1',
        source: 'PUBLISHED_VERSION',
        folderCount: 2,
        itemCount: 8,
      }),
    };
    reviewConfiguration = { resolve: jest.fn() };
    reviewTasks = {
      prepareTask: jest.fn(),
      createPreparedTask: jest.fn(),
      logPreparedTaskCreated: jest.fn(),
    };
    systemConfig = {
      getDefaultProjectRiskLevel: jest.fn().mockResolvedValue('Low'),
      getDefaultProjectPageSize: jest.fn().mockResolvedValue(20),
    };
    projectConfiguration = {
      validate: jest.fn().mockResolvedValue(undefined),
      validateUpdate: jest.fn().mockResolvedValue(undefined),
    };
    service = new ProjectService(
      prisma as unknown as PrismaService,
      projectAccess as unknown as ProjectAccessService,
      projectArchiveSnapshot as unknown as ProjectArchiveSnapshotService,
      reviewConfiguration as unknown as ReviewConfigurationService,
      reviewTasks as unknown as ReviewTaskService,
      systemConfig as unknown as SystemConfigService,
      projectConfiguration as unknown as ProjectConfigurationService,
    );
  });

  it('applies data scope and nulls every financial field without permission', async () => {
    prisma.project.count.mockResolvedValue(1);
    prisma.project.findMany.mockResolvedValue([mockProject]);

    const result = await service.findAll({ page: 1, pageSize: 20 }, publicActor);

    expect(projectAccess.buildProjectWhere).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(expect.objectContaining({ page: 1, pageSize: 20, total: 1 }));
    expect(result).not.toHaveProperty('list');
    expect(result).not.toHaveProperty('pagination');
    expect(result).not.toHaveProperty('totalPages');
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        status: 'ACTIVE',
        currentStage: 'CONSTRUCTION',
        countryName: '越南',
        contractCurrency: null,
        baseCurrency: null,
        contractAmount: null,
        exchangeRate: null,
        convertedAmount: null,
        exchangeRateDate: null,
        exchangeRateSource: null,
      }),
    );
    expect(result.items[0]).not.toHaveProperty('projectStatus');
  });

  it('returns normalized financial fields with project:view_financial', async () => {
    prisma.project.count.mockResolvedValue(1);
    prisma.project.findMany.mockResolvedValue([mockProject]);

    const result = await service.findAll({}, financialActor);

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        contractCurrency: 'USD',
        baseCurrency: 'CNY',
        contractAmount: 100000,
        exchangeRate: 7.2,
        convertedAmount: 720000,
      }),
    );
  });

  it('separately exposes contract and acceptance fields with their permissions', async () => {
    prisma.project.findFirst.mockResolvedValue(mockProject);

    const result = await service.findById('project-1', sensitiveActor);

    expect(result).toEqual(
      expect.objectContaining({
        contractNo: 'CT-001',
        contractSignedAt: new Date('2026-06-20'),
        expectedAcceptanceAt: new Date('2026-12-20'),
        actualAcceptanceAt: null,
        acceptanceTimeType: 'EXPECTED',
        progressPercent: 40,
      }),
    );
  });

  it('combines search and status filters with the scoped query', async () => {
    projectAccess.buildProjectWhere.mockResolvedValue({
      deletedAt: null,
      members: { some: { userId: 'user-1' } },
    });
    prisma.project.count.mockResolvedValue(0);
    prisma.project.findMany.mockResolvedValue([]);

    await service.findAll({ keyword: 'AC', lifecycleStatus: 'ACTIVE', scope: 'all' }, publicActor);

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              deletedAt: null,
              members: { some: { userId: 'user-1' } },
            },
            { archivedAt: null },
            {
              OR: [
                { projectName: { contains: 'AC' } },
                { shortName: { contains: 'AC' } },
                { projectCode: { contains: 'AC' } },
                { customerName: { contains: 'AC' } },
              ],
            },
            { status: 'ACTIVE' },
          ],
        },
      }),
    );
  });

  it('checks data scope and nulls finance in project detail', async () => {
    prisma.project.findFirst.mockResolvedValue(mockProject);

    const result = await service.findById('project-1', publicActor);

    expect(projectAccess.buildProjectWhere).toHaveBeenCalledWith('user-1');
    expect(result.contractAmount).toBeNull();
  });

  it('returns 404 when a project does not exist', async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(service.findById('missing', publicActor)).rejects.toThrow(NotFoundException);
  });

  it('creates the project and leadership membership without a review task when unconfigured', async () => {
    const dto: CreateProjectDto = {
      projectName: '新项目',
      countryCode: 'VN',
      archiveTemplateId,
      projectManagerId: 'manager-1',
    };
    prisma.project.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(mockProject);
    prisma.project.create.mockResolvedValue(mockProject);
    prisma.projectMember.upsert.mockResolvedValue({});

    const result = await service.create(dto, publicActor, idempotencyKey);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result.revision).toBe(1);
    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectName: '新项目',
          createdBy: 'user-1',
          status: 'ACTIVE',
          createIdempotencyKey: idempotencyKey,
          createRequestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    expect(prisma.projectMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId_userId: {
            projectId: 'project-1',
            userId: 'manager-1',
          },
        },
      }),
    );
    expect(projectArchiveSnapshot.createProjectSnapshot).toHaveBeenCalledWith(
      prisma,
      'project-1',
      expect.objectContaining({ countryCode: 'VN' }),
    );
    expect(reviewConfiguration.resolve).not.toHaveBeenCalled();
    expect(reviewTasks.prepareTask).not.toHaveBeenCalled();
    expect(reviewTasks.createPreparedTask).not.toHaveBeenCalled();
    expect(prisma.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        afterData: expect.objectContaining({
          lifecycleStatus: 'ACTIVE',
          reviewTaskId: null,
        }),
      }),
    });
  });

  it('stores contract and converted amounts with two decimal places', async () => {
    prisma.project.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(mockProject);
    prisma.project.create.mockResolvedValue(mockProject);
    prisma.exchangeRate.findFirst.mockResolvedValue({
      rate: new Prisma.Decimal('7.2'),
      rateDate: new Date('2026-07-17T00:00:00.000Z'),
      source: 'test',
    });

    await service.create(
      {
        projectName: '金额精度项目',
        countryCode: 'VN',
        archiveTemplateId,
        contractCurrency: 'USD',
        baseCurrency: 'CNY',
        contractAmount: 100.1,
      },
      sensitiveActor,
      idempotencyKey,
    );

    const createData = prisma.project.create.mock.calls[0]?.[0]?.data as {
      contractAmount: Prisma.Decimal;
      convertedAmount: Prisma.Decimal;
    };
    expect(createData.contractAmount.toFixed(2)).toBe('100.10');
    expect(createData.convertedAmount.toFixed(2)).toBe('720.72');
  });

  it('returns the same project for the same actor, key and canonical request payload', async () => {
    const originalDto: CreateProjectDto = {
      projectName: '幂等项目',
      countryCode: 'VN',
      archiveTemplateId,
    };
    prisma.project.findUnique.mockResolvedValue({
      id: 'project-1',
      createdBy: 'user-1',
      createRequestHash: hashProjectCreateRequest(originalDto),
    });
    prisma.project.findFirst.mockResolvedValue(mockProject);

    const result = await service.create(
      {
        archiveTemplateId,
        countryCode: 'VN',
        projectName: '幂等项目',
      },
      publicActor,
      idempotencyKey,
    );

    expect(result.id).toBe('project-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('uses the configured default risk level when the create request omits it', async () => {
    systemConfig.getDefaultProjectRiskLevel.mockResolvedValue('High');
    prisma.project.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(mockProject);
    prisma.project.create.mockResolvedValue(mockProject);

    await service.create(
      { projectName: '默认风险项目', countryCode: 'VN', archiveTemplateId },
      publicActor,
      idempotencyKey,
    );

    expect(systemConfig.getDefaultProjectRiskLevel).toHaveBeenCalledTimes(1);
    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ riskLevel: 'High' }),
      }),
    );
  });

  it('rejects reuse of a project create key with a different payload', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'project-1',
      createdBy: 'user-1',
      createRequestHash: hashProjectCreateRequest({
        projectName: '原项目',
        countryCode: 'VN',
        archiveTemplateId,
      }),
    });

    await expect(
      service.create(
        { projectName: '另一个项目', countryCode: 'VN', archiveTemplateId },
        publicActor,
        idempotencyKey,
      ),
    ).rejects.toThrow(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects reuse of a project create key by a different actor', async () => {
    const dto: CreateProjectDto = {
      projectName: '幂等项目',
      countryCode: 'VN',
      archiveTemplateId,
    };
    prisma.project.findUnique.mockResolvedValue({
      id: 'project-1',
      createdBy: 'another-user',
      createRequestHash: hashProjectCreateRequest(dto),
    });

    await expect(service.create(dto, publicActor, idempotencyKey)).rejects.toThrow(
      ConflictException,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('converges a concurrent P2002 create race to the committed project', async () => {
    const dto: CreateProjectDto = {
      projectName: '并发项目',
      countryCode: 'VN',
      archiveTemplateId,
    };
    prisma.project.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'project-1',
      createdBy: 'user-1',
      createRequestHash: hashProjectCreateRequest(dto),
    });
    prisma.project.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(mockProject);
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });

    const result = await service.create(dto, publicActor, idempotencyKey);

    expect(result.id).toBe('project-1');
    expect(prisma.project.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not swallow an unrelated unique constraint conflict', async () => {
    const uniqueError = { code: 'P2002', meta: { target: ['project_code'] } };
    prisma.project.findUnique.mockResolvedValue(null);
    prisma.project.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockRejectedValue(uniqueError);

    await expect(
      service.create(
        { projectName: '冲突项目', countryCode: 'VN', archiveTemplateId },
        publicActor,
        idempotencyKey,
      ),
    ).rejects.toBe(uniqueError);
  });

  it('creates a configured project review task in the same transaction while keeping the project draft', async () => {
    const preparedReview = {
      input: {
        sourceType: 'PROJECT_CREATE',
        sourceId: 'generated-project-id',
        title: '新建项目：需审批项目',
      },
      normalizedSteps: [
        {
          mode: 'SINGLE',
          requiredCount: 1,
          assigneeUserIds: ['reviewer-1'],
        },
      ],
      submittedAt: new Date('2026-07-11T00:00:00.000Z'),
    };
    prisma.project.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(mockProject);
    prisma.project.create.mockResolvedValue(mockProject);
    prisma.approvalTemplate.findMany.mockResolvedValue([
      { id: 'approval-template-vn', countryCode: 'VN' },
      { id: 'approval-template-global', countryCode: null },
    ]);
    reviewConfiguration.resolve.mockResolvedValue({
      approvalTemplateId: 'approval-template-vn',
      approvalTemplateVersion: '2026-07-11T00:00:00.000Z',
      snapshot: { id: 'approval-template-vn' },
      reviewMode: 'SINGLE',
      steps: [{ mode: 'SINGLE', assigneeUserIds: ['reviewer-1'] }],
    });
    reviewTasks.prepareTask.mockResolvedValue(preparedReview);
    reviewTasks.createPreparedTask.mockResolvedValue('review-task-1');

    await service.create(
      { projectName: '需审批项目', countryCode: 'VN', archiveTemplateId },
      publicActor,
      idempotencyKey,
    );

    expect(reviewConfiguration.resolve).toHaveBeenCalledWith('approval-template-vn', 'user-1');
    expect(reviewTasks.prepareTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'PROJECT_CREATE',
        projectId: expect.any(String),
        submittedBy: 'user-1',
        approvalTemplateId: 'approval-template-vn',
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DRAFT',
        }),
      }),
    );
    expect(projectArchiveSnapshot.createProjectSnapshot).toHaveBeenCalledWith(
      prisma,
      'project-1',
      expect.any(Object),
    );
    expect(reviewTasks.createPreparedTask).toHaveBeenCalledWith(prisma, preparedReview);
    expect(prisma.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'create',
        afterData: expect.objectContaining({ reviewTaskId: 'review-task-1' }),
      }),
    });
    expect(prisma.operationLog.create).toHaveBeenCalledTimes(1);
    expect(reviewTasks.logPreparedTaskCreated).not.toHaveBeenCalled();
  });

  it('rejects an explicit approval template with a mismatched business type before writes', async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    prisma.approvalTemplate.findMany.mockResolvedValue([]);

    await expect(
      service.create(
        {
          projectName: '新项目',
          countryCode: 'VN',
          archiveTemplateId,
          approvalTemplateId: 'standard-approval-template',
        },
        publicActor,
        idempotencyKey,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.approvalTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'standard-approval-template',
          businessType: 'PROJECT_CREATE',
          isEnabled: true,
          deletedAt: null,
        }),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('propagates membership failure from the project transaction', async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    prisma.project.create.mockResolvedValue(mockProject);
    prisma.projectMember.upsert.mockRejectedValue(new Error('member write failed'));

    await expect(
      service.create(
        {
          projectName: '新项目',
          countryCode: 'VN',
          archiveTemplateId,
          projectManagerId: 'manager-1',
        },
        publicActor,
        idempotencyKey,
      ),
    ).rejects.toThrow('member write failed');
  });

  it('propagates archive snapshot failure from the project transaction', async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    prisma.project.create.mockResolvedValue(mockProject);
    prisma.projectMember.upsert.mockResolvedValue({});
    projectArchiveSnapshot.createProjectSnapshot.mockRejectedValue(
      new Error('archive snapshot failed'),
    );

    await expect(
      service.create(
        {
          projectName: '新项目',
          countryCode: 'VN',
          archiveTemplateId,
        },
        publicActor,
        idempotencyKey,
      ),
    ).rejects.toThrow('archive snapshot failed');
    expect(prisma.operationLog.create).not.toHaveBeenCalled();
  });

  it('rejects financial writes without financial permission', async () => {
    await expect(
      service.create(
        {
          projectName: '新项目',
          countryCode: 'VN',
          archiveTemplateId,
          contractCurrency: 'USD',
          baseCurrency: 'CNY',
          contractAmount: 100,
        },
        publicActor,
        idempotencyKey,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('updates a project after a scoped authorization check', async () => {
    prisma.project.findFirst.mockResolvedValue(mockProject);
    prisma.project.findUniqueOrThrow.mockResolvedValue({
      ...mockProject,
      projectName: '更新后的项目',
      revision: 2,
    });
    prisma.project.findFirst.mockResolvedValueOnce(mockProject).mockResolvedValueOnce({
      ...mockProject,
      projectName: '更新后的项目',
      revision: 2,
    });

    const result = await service.update(
      'project-1',
      { revision: 1, projectName: '更新后的项目' },
      publicActor,
    );

    expect(projectAccess.buildProjectWhere).toHaveBeenCalledWith('user-1');
    expect(result.projectName).toBe('更新后的项目');
    expect(result.contractAmount).toBeNull();
    expect(prisma.project.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        deletedAt: null,
        revision: 1,
        updatedAt: mockProject.updatedAt,
      },
      data: expect.objectContaining({
        projectName: '更新后的项目',
        revision: { increment: 1 },
      }),
    });
    expect(prisma.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'update',
        beforeData: expect.objectContaining({ revision: 1 }),
        afterData: expect.objectContaining({ revision: 2 }),
      }),
    });
  });

  it('rejects a stale revision before an ordinary project edit', async () => {
    prisma.project.findFirst.mockResolvedValue({ ...mockProject, revision: 2 });

    await expect(
      service.update('project-1', { revision: 1, projectName: '过期编辑' }, publicActor),
    ).rejects.toThrow(ConflictException);

    expect(prisma.project.updateMany).not.toHaveBeenCalled();
    expect(prisma.operationLog.create).not.toHaveBeenCalled();
  });

  it('physically deletes an empty project only for a super administrator and audits it', async () => {
    const adminActor = { ...publicActor, roles: ['SUPER_ADMIN'], permissions: ['project:delete'] };
    prisma.project.findUnique.mockResolvedValue({ ...mockProject, archivedAt: new Date() });

    await service.purge('project-1', adminActor);

    expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: 'project-1' } });
    expect(prisma.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        action: 'purge',
        targetId: 'project-1',
        result: 'success',
      }),
    });
  });

  it('blocks physical deletion when protected records exist and audits the rejection', async () => {
    const adminActor = { ...publicActor, roles: ['SUPER_ADMIN'], permissions: ['project:delete'] };
    prisma.project.findUnique.mockResolvedValue({ ...mockProject, archivedAt: new Date() });
    prisma.projectArchiveFile.count.mockResolvedValue(2);
    prisma.reviewTask.count.mockResolvedValue(1);

    await expect(service.purge('project-1', adminActor)).rejects.toThrow(ConflictException);

    expect(prisma.project.delete).not.toHaveBeenCalled();
    expect(prisma.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'purge',
        result: 'failure',
        errorReason: expect.stringContaining('文件 2 条'),
      }),
    });
  });

  it('rejects physical deletion for non-super-administrators', async () => {
    await expect(service.purge('project-1', publicActor)).rejects.toThrow(ForbiddenException);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it('generates the next project code sequence', async () => {
    prisma.project.findFirst.mockResolvedValue({
      projectCode: 'VN-AC-2026-009',
    });

    await expect(service.generateProjectCode('VN', 'AC')).resolves.toBe('VN-AC-2026-010');
  });

  it('audits an authorized financial detail read with request metadata', async () => {
    prisma.project.findFirst.mockResolvedValue(mockProject);

    await service.findById('project-1', financialActor, {
      ipAddress: '10.0.0.1',
      userAgent: 'browser',
    });

    expect(prisma.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        action: 'view_financial',
        targetId: 'project-1',
        ipAddress: '10.0.0.1',
        userAgent: 'browser',
        result: 'success',
      }),
    });
  });

  it('returns project summary counts inside the same data scope', async () => {
    prisma.project.count
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    await expect(service.getSummary(publicActor, 'all')).resolves.toEqual({
      total: 8,
      active: 4,
      accepted: 2,
      acceptedThisYear: 2,
      highRisk: 1,
      totalConvertedAmount: null,
      acceptedConvertedAmount: null,
    });
    expect(projectAccess.buildProjectWhere).toHaveBeenCalledWith('user-1');
    expect(prisma.project.count).toHaveBeenNthCalledWith(2, {
      where: {
        AND: [
          { AND: [{ deletedAt: null }, { archivedAt: null }] },
          { status: 'ACTIVE', archivedAt: null },
        ],
      },
    });
  });

  it('returns scoped CNY summary amounts only with financial permission', async () => {
    prisma.project.count
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    prisma.project.aggregate.mockResolvedValueOnce({
      _sum: { convertedAmount: new Prisma.Decimal('28565000') },
    });
    prisma.projectPayment.aggregate.mockResolvedValueOnce({
      _sum: { receivedConvertedAmount: new Prisma.Decimal('15683000') },
    });

    await expect(service.getSummary(financialActor, 'mine')).resolves.toMatchObject({
      totalConvertedAmount: 28565000,
      acceptedConvertedAmount: 15683000,
      acceptedThisYear: 2,
    });
    expect(prisma.projectPayment.aggregate).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        project: expect.objectContaining({ AND: expect.any(Array) }),
      },
      _sum: { receivedConvertedAmount: true },
    });
  });

  it('requires a reason when moving project progress to an earlier stage', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: 'project-1',
      currentStage: 'CONSTRUCTION',
      progressPercent: new Prisma.Decimal(40),
      expectedAcceptanceAt: null,
      actualAcceptanceAt: null,
      status: 'ACTIVE',
      revision: 1,
    });

    await expect(
      service.updateProgress(
        'project-1',
        { revision: 1, targetStage: 'DEEPENING', progressPercent: 35 },
        sensitiveActor,
      ),
    ).rejects.toThrow('项目阶段回退必须填写变更说明');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates stage, percentage and audit log atomically through the progress command', async () => {
    prisma.project.findFirst
      .mockResolvedValueOnce({
        id: 'project-1',
        currentStage: 'CONSTRUCTION',
        progressPercent: new Prisma.Decimal(40),
        expectedAcceptanceAt: null,
        actualAcceptanceAt: null,
        status: 'ACTIVE',
        revision: 1,
      })
      .mockResolvedValueOnce(mockProject);

    await service.updateProgress(
      'project-1',
      { revision: 1, targetStage: 'TESTING', progressPercent: 70, reason: '现场已进入测试' },
      sensitiveActor,
    );

    expect(prisma.project.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        revision: 1,
        archivedAt: null,
      },
      data: {
        currentStage: 'TESTING',
        progressPercent: new Prisma.Decimal(70),
        expectedAcceptanceAt: null,
        actualAcceptanceAt: null,
        revision: { increment: 1 },
      },
    });
    expect(prisma.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'progress_update',
        beforeData: expect.objectContaining({ stage: 'CONSTRUCTION', progressPercent: '40' }),
        afterData: expect.objectContaining({
          stage: 'TESTING',
          progressPercent: 70,
          revision: 2,
          reason: '现场已进入测试',
        }),
      }),
    });
    expect(prisma.projectProcessRecord.create).toHaveBeenCalled();
  });

  it('rejects a concurrent progress update when the CAS no longer matches', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: 'project-1',
      currentStage: 'CONSTRUCTION',
      progressPercent: new Prisma.Decimal(40),
      expectedAcceptanceAt: null,
      actualAcceptanceAt: null,
      status: 'ACTIVE',
      revision: 1,
    });
    prisma.project.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateProgress(
        'project-1',
        { revision: 1, targetStage: 'TESTING', progressPercent: 70 },
        sensitiveActor,
      ),
    ).rejects.toThrow(ConflictException);

    expect(prisma.operationLog.create).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('uses a dedicated status command without writing the retired status column', async () => {
    prisma.project.findFirst
      .mockResolvedValueOnce({
        id: 'project-1',
        status: 'ACTIVE',
        archivedAt: null,
        revision: 1,
      })
      .mockResolvedValueOnce(mockProject);

    await service.changeStatus(
      'project-1',
      'pause',
      { revision: 1, reason: '等待客户确认' },
      sensitiveActor,
    );

    expect(prisma.project.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        deletedAt: null,
        revision: 1,
        status: 'ACTIVE',
        archivedAt: null,
      },
      data: {
        status: 'PAUSED',
        revision: { increment: 1 },
      },
    });
    expect(prisma.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'pause',
        beforeData: expect.objectContaining({ lifecycleStatus: 'ACTIVE' }),
        afterData: expect.objectContaining({
          lifecycleStatus: 'PAUSED',
          reason: '等待客户确认',
        }),
      }),
    });
  });

  it('rejects a stale revision before executing a status command', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: 'project-1',
      status: 'ACTIVE',
      archivedAt: null,
      revision: 2,
    });

    await expect(
      service.changeStatus('project-1', 'pause', { revision: 1 }, sensitiveActor),
    ).rejects.toThrow(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records actual acceptance through the unified progress command', async () => {
    prisma.project.findFirst
      .mockResolvedValueOnce({
        id: 'project-1',
        currentStage: 'TESTING',
        progressPercent: new Prisma.Decimal(90),
        expectedAcceptanceAt: new Date('2026-12-20'),
        actualAcceptanceAt: null,
        status: 'ACTIVE',
        revision: 1,
      })
      .mockResolvedValueOnce({
        ...mockProject,
        status: 'COMPLETED',
        actualAcceptanceAt: new Date('2026-12-18'),
      });

    const result = await service.updateProgress(
      'project-1',
      {
        revision: 1,
        targetStage: 'EXTERNAL_ACCEPTANCE',
        progressPercent: 100,
        actualAcceptanceAt: '2026-12-18T00:00:00.000Z',
        reason: '客户签署验收单',
      },
      sensitiveActor,
    );

    expect(prisma.project.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        revision: 1,
        archivedAt: null,
      },
      data: {
        currentStage: 'EXTERNAL_ACCEPTANCE',
        progressPercent: new Prisma.Decimal(100),
        expectedAcceptanceAt: new Date('2026-12-20'),
        actualAcceptanceAt: new Date('2026-12-18T00:00:00.000Z'),
        status: 'COMPLETED',
        revision: { increment: 1 },
      },
    });
    expect(prisma.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'progress_update',
        afterData: expect.objectContaining({
          reason: '客户签署验收单',
        }),
      }),
    });
    expect(result.acceptanceTimeType).toBe('ACTUAL');
  });

  it('rejects a concurrent acceptance progress update when the CAS no longer matches', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: 'project-1',
      currentStage: 'TESTING',
      progressPercent: new Prisma.Decimal(90),
      expectedAcceptanceAt: new Date('2026-12-20'),
      actualAcceptanceAt: null,
      status: 'ACTIVE',
      revision: 1,
    });
    prisma.project.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateProgress(
        'project-1',
        {
          revision: 1,
          targetStage: 'EXTERNAL_ACCEPTANCE',
          progressPercent: 100,
          actualAcceptanceAt: '2026-12-18T00:00:00.000Z',
        },
        sensitiveActor,
      ),
    ).rejects.toThrow(ConflictException);

    expect(prisma.operationLog.create).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });
});
