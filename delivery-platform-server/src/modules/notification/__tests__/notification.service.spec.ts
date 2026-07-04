import { NotFoundException } from '@nestjs/common';

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

    await expect(
      service.markAsRead('notification-1', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id: 'notification-1', userId: 'user-1' },
    });
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('applies an enabled in-app rule and renders configured variables', async () => {
    const prisma = {
      notificationRule: {
        findFirst: jest.fn().mockResolvedValue({
          isEnabled: true,
          channel: 'in_app',
          recipientRole: 'PROJECT_MANAGER',
          template: '{{title}}：{{content}}',
        }),
      },
      userRole: {
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaService;
    const service = new NotificationService(prisma);

    await expect(
      service.resolveInAppNotification({
        eventType: 'approval_pending',
        userId: 'user-1',
        title: '待审批',
        content: '周报已提交',
      }),
    ).resolves.toEqual({
      title: '待审批',
      content: '待审批：周报已提交',
    });
  });
});
