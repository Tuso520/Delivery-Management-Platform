import type { PrismaService } from '../../../database/prisma.service';
import type { OperationLogService } from '../../operation-log/operation-log.service';
import { ApprovalTemplateService } from '../approval-template.service';

describe('ApprovalTemplateService target configuration', () => {
  const operationLog = {
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as OperationLogService;

  beforeEach(() => jest.clearAllMocks());

  it('accepts PROJECT_CREATE because its unified review adapter is registered', async () => {
    const createdAt = new Date('2026-07-11T00:00:00.000Z');
    const template = {
      id: 'project-create-template',
      templateCode: 'PROJECT_CREATE',
      templateName: '项目创建审批',
      businessType: 'PROJECT_CREATE',
      countryCode: null,
      isEnabled: true,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt,
      steps: [
        {
          id: 'step-project-create',
          templateId: 'project-create-template',
          stepOrder: 1,
          stepName: '交付负责人审批',
          mode: 'SINGLE',
          requiredCount: 1,
          approverType: 'role',
          approverValues: ['DELIVERY_MANAGER'],
          createdAt,
          updatedAt: createdAt,
        },
      ],
    };
    const tx = {
      approvalTemplate: {
        create: jest.fn().mockResolvedValue(template),
        findUnique: jest.fn().mockResolvedValue(template),
      },
      approvalStep: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      approvalTemplate: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx)),
    } as unknown as PrismaService;
    const service = new ApprovalTemplateService(prisma, operationLog);

    await expect(
      service.create(
        {
          templateCode: 'PROJECT_CREATE',
          templateName: '项目创建审批',
          businessType: 'PROJECT_CREATE',
          steps: [
            {
              stepOrder: 1,
              stepName: '交付负责人审批',
              mode: 'SINGLE',
              approverType: 'role',
              approverValues: ['DELIVERY_MANAGER'],
            },
          ],
        },
        'admin-1',
      ),
    ).resolves.toEqual(expect.objectContaining({ businessType: 'PROJECT_CREATE' }));
  });

  it('creates only a registered target template with consecutive steps', async () => {
    const createdAt = new Date('2026-07-11T00:00:00.000Z');
    const template = {
      id: 'template-1',
      templateCode: 'STANDARD_DEFAULT',
      templateName: '标准发布审批',
      businessType: 'STANDARD',
      countryCode: null,
      isEnabled: true,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt,
      steps: [
        {
          id: 'step-1',
          templateId: 'template-1',
          stepOrder: 1,
          stepName: '标准管理员审批',
          mode: 'SINGLE',
          requiredCount: 1,
          approverType: 'role',
          approverValues: ['STANDARD_ADMIN'],
          createdAt,
          updatedAt: createdAt,
        },
      ],
    };
    const tx = {
      approvalTemplate: {
        create: jest.fn().mockResolvedValue(template),
        findUnique: jest.fn().mockResolvedValue(template),
      },
      approvalStep: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      approvalTemplate: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx)),
    } as unknown as PrismaService;
    const service = new ApprovalTemplateService(prisma, operationLog);

    const result = await service.create(
      {
        templateCode: 'STANDARD_DEFAULT',
        templateName: '标准发布审批',
        businessType: 'STANDARD',
        steps: [
          {
            stepOrder: 1,
            stepName: '标准管理员审批',
            mode: 'SINGLE',
            approverType: 'role',
            approverValues: ['STANDARD_ADMIN'],
          },
        ],
      },
      'admin-1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'template-1',
        businessType: 'STANDARD',
        enabled: true,
      }),
    );
    expect(operationLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'approval_config',
        action: 'create',
        targetId: 'template-1',
      }),
    );
  });

  it('persists an ANY_N step with multiple immutable approver selectors', async () => {
    const createdAt = new Date('2026-07-12T00:00:00.000Z');
    const template = {
      id: 'template-any-n',
      templateCode: 'ARCHIVE_ANY_N',
      templateName: '档案任意两人会签',
      businessType: 'PROJECT_ARCHIVE_FILE',
      countryCode: null,
      isEnabled: true,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt,
      steps: [
        {
          id: 'step-any-n',
          templateId: 'template-any-n',
          stepOrder: 1,
          stepName: '交付与标准会签',
          mode: 'ANY_N',
          requiredCount: 2,
          approverType: 'user',
          approverValues: ['reviewer-1', 'reviewer-2', 'reviewer-3'],
          createdAt,
          updatedAt: createdAt,
        },
      ],
    };
    const tx = {
      approvalTemplate: {
        create: jest.fn().mockResolvedValue(template),
        findUnique: jest.fn().mockResolvedValue(template),
      },
      approvalStep: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      approvalTemplate: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx)),
    } as unknown as PrismaService;
    const service = new ApprovalTemplateService(prisma, operationLog);

    await service.create(
      {
        templateCode: 'ARCHIVE_ANY_N',
        templateName: '档案任意两人会签',
        businessType: 'PROJECT_ARCHIVE_FILE',
        steps: [
          {
            stepOrder: 1,
            stepName: '交付与标准会签',
            mode: 'ANY_N',
            requiredCount: 2,
            approverType: 'user',
            approverValues: ['reviewer-1', 'reviewer-2', 'reviewer-3'],
          },
        ],
      },
      'admin-1',
    );

    expect(tx.approvalStep.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          mode: 'ANY_N',
          requiredCount: 2,
          approverValues: ['reviewer-1', 'reviewer-2', 'reviewer-3'],
        }),
      ],
    });
  });
});
