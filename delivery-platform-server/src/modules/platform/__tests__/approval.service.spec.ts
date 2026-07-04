import { ConflictException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import type { NotificationService } from '../../notification/notification.service';
import type { OperationLogService } from '../../operation-log/operation-log.service';
import { ApprovalBusinessService } from '../approval-business.service';
import { ApprovalService } from '../approval.service';

describe('ApprovalService business workflow', () => {
  const operationLog = {
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as OperationLogService;
  const businessWorkflow = new ApprovalBusinessService();
  const notificationService = {
    resolveInAppNotification: jest.fn().mockImplementation(
      ({ title, content }: { title: string; content: string }) =>
        Promise.resolve({ title, content }),
    ),
  } as unknown as NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts a report approval and records the submission', async () => {
    const transaction = {
      approvalTask: {
        create: jest.fn().mockResolvedValue({
          id: 'task-1',
          businessType: 'report',
          businessId: 'report-1',
        }),
      },
      approvalAction: { create: jest.fn().mockResolvedValue({ id: 'action-1' }) },
      dailyReport: { update: jest.fn().mockResolvedValue({ id: 'report-1' }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 'notice-1' }) },
    };
    const prisma = {
      approvalTask: { findFirst: jest.fn().mockResolvedValue(null) },
      approvalTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-1',
          businessType: 'report',
          steps: [{
            stepOrder: 1,
            approverType: 'user',
            approverValue: 'manager-1',
          }],
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'manager-1' }),
      },
      $transaction: jest.fn().mockImplementation(
        (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new ApprovalService(
      prisma,
      operationLog,
      businessWorkflow,
      notificationService,
    );

    const result = await service.startBusinessApproval({
      businessType: 'report',
      businessId: 'report-1',
      businessTitle: 'VN-001 周报',
      applicantId: 'user-1',
      countryCode: 'VN',
    });

    expect(result).toEqual(expect.objectContaining({ id: 'task-1' }));
    expect(transaction.dailyReport.update).toHaveBeenCalledWith({
      where: { id: 'report-1' },
      data: { status: 'Submitted' },
    });
    expect(transaction.approvalAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: 'task-1',
        action: 'Submitted',
        actorId: 'user-1',
      }),
    });
    expect(transaction.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'manager-1',
        relatedType: 'report',
        relatedId: 'report-1',
      }),
    });
  });

  it('prevents duplicate pending approval tasks', async () => {
    const prisma = {
      approvalTask: { findFirst: jest.fn().mockResolvedValue({ id: 'task-1' }) },
    } as unknown as PrismaService;
    const service = new ApprovalService(
      prisma,
      operationLog,
      businessWorkflow,
      notificationService,
    );

    await expect(service.startBusinessApproval({
      businessType: 'knowledge',
      businessId: 'article-1',
      businessTitle: '施工安全手册',
      applicantId: 'user-1',
    })).rejects.toThrow(new ConflictException('该业务已有待处理审批任务'));
  });

  it('approves the final checklist step and keeps an action history', async () => {
    const transaction = {
      approvalTask: {
        update: jest.fn().mockResolvedValue({
          id: 'task-1',
          status: 'Approved',
        }),
      },
      approvalAction: { create: jest.fn().mockResolvedValue({ id: 'action-2' }) },
      projectChecklistItem: {
        update: jest.fn().mockResolvedValue({ id: 'check-1', status: 'Approved' }),
      },
      notification: { create: jest.fn().mockResolvedValue({ id: 'notice-2' }) },
    };
    const prisma = {
      approvalTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          businessType: 'checklist',
          businessId: 'check-1',
          businessTitle: '设备安装检查',
          applicantId: 'user-1',
          currentStep: 1,
          approverId: 'manager-1',
          status: 'Pending',
          template: {
            steps: [{
              stepOrder: 1,
              approverType: 'user',
              approverValue: 'manager-1',
            }],
          },
        }),
      },
      $transaction: jest.fn().mockImplementation(
        (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new ApprovalService(
      prisma,
      operationLog,
      businessWorkflow,
      notificationService,
    );

    await service.decideTask(
      'task-1',
      { decision: 'Approved', comment: '现场记录完整' },
      'manager-1',
    );

    expect(transaction.projectChecklistItem.update).toHaveBeenCalledWith({
      where: { id: 'check-1' },
      data: expect.objectContaining({
        status: 'Approved',
        reviewUserId: 'manager-1',
        reviewComment: '现场记录完整',
        reviewedAt: expect.any(Date),
        completedAt: expect.any(Date),
      }),
    });
    expect(transaction.approvalAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: 'task-1',
        stepOrder: 1,
        action: 'Approved',
        actorId: 'manager-1',
      }),
    });
  });
});
