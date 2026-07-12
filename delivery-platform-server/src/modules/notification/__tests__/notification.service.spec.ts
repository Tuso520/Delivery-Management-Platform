import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import { NotificationService } from '../notification.service';

describe('NotificationService ownership', () => {
  it('does not allow a user to mark another users notification as read', async () => {
    const prisma = {
      notification: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    const service = new NotificationService(prisma);

    await expect(service.markAsRead('notification-1', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id: 'notification-1', userId: 'user-1' },
    });
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('applies an enabled target in-app rule without reading retired template fields', async () => {
    const prisma = {
      notificationRule: {
        findFirst: jest.fn().mockResolvedValue({
          isEnabled: true,
          channels: ['IN_APP'],
          recipientPolicy: { type: 'ROLE', values: ['PROJECT_MANAGER'] },
        }),
      },
      userRole: {
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaService;
    const service = new NotificationService(prisma);

    await expect(
      service.resolveDeliveryPlan({
        eventType: 'approval_pending',
        userId: 'user-1',
        title: '待审批',
        content: '周报已提交',
      }),
    ).resolves.toEqual({
      title: '待审批',
      content: '周报已提交',
      channels: ['IN_APP'],
    });
  });

  it('resolves external channels only for users matching the recipient policy', async () => {
    const roleCount = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const prisma = {
      notificationRule: {
        findFirst: jest.fn().mockResolvedValue({
          isEnabled: true,
          channels: ['FEISHU', 'WECOM'],
          recipientPolicy: { type: 'ROLE', values: ['PROJECT_MANAGER'] },
        }),
      },
      userRole: { count: roleCount },
    } as unknown as PrismaService;
    const service = new NotificationService(prisma);
    const input = {
      eventType: 'ProjectStageChanged',
      userId: 'user-1',
      title: '项目阶段变更',
      content: '项目已进入调试阶段',
    };

    await expect(service.resolveDeliveryPlan(input)).resolves.toEqual({
      title: input.title,
      content: input.content,
      channels: ['FEISHU', 'WECOM'],
    });
    await expect(service.resolveDeliveryPlan({ ...input, userId: 'user-2' })).resolves.toBeNull();
  });

  it('returns the target flat pagination contract', async () => {
    const item = {
      id: 'notification-1',
      title: '待审批',
      content: '请处理',
      notificationType: 'review_pending',
      relatedType: 'ReviewTask',
      relatedId: 'task-1',
      isRead: false,
      createdAt: new Date('2026-07-12T00:00:00.000Z'),
      readAt: null,
    };
    const prisma = {
      notification: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([item]),
      },
    } as unknown as PrismaService;
    const service = new NotificationService(prisma);

    await expect(service.findByUser('user-1', { page: 2, pageSize: 10 })).resolves.toEqual({
      items: [item],
      page: 2,
      pageSize: 10,
      total: 1,
    });
  });

  it('creates a multi-channel target rule without dual-writing retired fields', async () => {
    const create = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'rule-1',
      ...data,
      createdAt: new Date('2026-07-11T00:00:00.000Z'),
      updatedAt: new Date('2026-07-11T00:00:00.000Z'),
    }));
    const prisma = {
      notificationRule: { create },
    } as unknown as PrismaService;
    const service = new NotificationService(prisma);

    const result = await service.createTargetRule({
      name: '项目通知',
      eventType: 'ProjectCreated',
      channels: ['IN_APP', 'FEISHU'],
      recipientPolicy: { type: 'ROLE', values: ['PROJECT_MANAGER'] },
      templateId: 'template-1',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channels: ['IN_APP', 'FEISHU'],
        templateId: 'template-1',
      }),
    });
    const createData = create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(createData).not.toHaveProperty('channel');
    expect(createData).not.toHaveProperty('recipientRole');
    expect(result).toEqual(
      expect.objectContaining({
        channels: ['IN_APP', 'FEISHU'],
        enabled: true,
      }),
    );
  });

  it('rejects a fixed recipient policy without recipients', async () => {
    const prisma = {
      notificationRule: { create: jest.fn() },
    } as unknown as PrismaService;
    const service = new NotificationService(prisma);

    await expect(
      service.createTargetRule({
        name: '无接收人规则',
        eventType: 'ProjectCreated',
        channels: ['IN_APP'],
        recipientPolicy: { type: 'USER', values: [] },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.notificationRule.create).not.toHaveBeenCalled();
  });
});
