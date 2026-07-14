import { Prisma } from '@prisma/client';

import type { PrismaService } from '../../../database/prisma.service';
import type {
  NotificationEventInput,
  NotificationService,
} from '../../notification/notification.service';
import {
  IntegrationDeliveryError,
  type IntegrationService,
} from '../../platform/integration.service';
import { OutboxDispatcherService } from '../outbox-dispatcher.service';

interface EventRow {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
  attempts: number;
}

interface OutboxUpdateCall {
  where: {
    id?: string;
    status?: string;
    attempts?: number | { gte?: number; lt?: number };
  };
  data: {
    status?: string;
    availableAt?: Date;
    lastError?: string | null;
    processedAt?: Date | null;
  };
}

interface NotificationUpsertCall {
  where: { deduplicationKey: string };
  create: {
    deduplicationKey: string;
    userId: string;
    title: string;
    notificationType: string;
    relatedType: string;
    relatedId: string;
  };
}

interface UserFindCall {
  where: { id: { in: string[] } };
}

describe('OutboxDispatcherService', () => {
  it('atomically claims a due event and records unsupported events as auditable skips', async () => {
    const event = makeEvent({ eventType: 'FutureEvent' });
    const harness = createHarness(event);
    const notifications = createNotificationService();
    const service = new OutboxDispatcherService(harness.prisma, notifications.service);

    await expect(service.processBatch()).resolves.toBe(1);

    expect(harness.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: event.id,
          status: 'PENDING',
          attempts: 0,
        }),
        data: expect.objectContaining({
          status: 'PROCESSING',
          attempts: { increment: 1 },
        }),
      }),
    );
    expect(harness.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SKIPPED',
          lastError: 'UNSUPPORTED_EVENT_TYPE',
          processedAt: expect.any(Date),
        }),
      }),
    );
    expect(harness.upsertNotification).not.toHaveBeenCalled();
  });

  it('allows only one worker to claim the same event concurrently', async () => {
    const event = makeEvent({ eventType: 'ReviewTaskCreated', aggregateId: 'task-1' });
    let status = 'PENDING';
    const upsertNotification = jest.fn().mockResolvedValue({ id: 'notification-1' });
    const updateMany = jest.fn().mockImplementation(async (call: OutboxUpdateCall) => {
      if (!call.where.id) return { count: 0 };
      if (call.where.status === 'PENDING') {
        if (status !== 'PENDING') return { count: 0 };
        status = 'PROCESSING';
        return { count: 1 };
      }
      if (call.where.status === 'PROCESSING') {
        if (status !== 'PROCESSING') return { count: 0 };
        status = call.data.status ?? status;
        return { count: 1 };
      }
      return { count: 0 };
    });
    const prisma = {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([event]),
        updateMany,
      },
      reviewTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          title: '设计文件审核',
          steps: [{ assignees: [{ assigneeUserId: 'reviewer-1' }] }],
        }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'reviewer-1' }]),
      },
      notificationDelivery: createNotificationDeliveryModel(),
      notification: { upsert: upsertNotification },
    } as unknown as PrismaService;
    const notifications = createNotificationService();
    const first = new OutboxDispatcherService(prisma, notifications.service);
    const second = new OutboxDispatcherService(prisma, notifications.service);

    await expect(Promise.all([first.processBatch(), second.processBatch()])).resolves.toEqual(
      expect.arrayContaining([1, 0]),
    );
    expect(upsertNotification).toHaveBeenCalledTimes(1);
  });

  it('starts each lease when that event is actually claimed', async () => {
    jest.useFakeTimers();
    try {
      const startedAt = new Date('2026-07-11T00:00:00.000Z');
      jest.setSystemTime(startedAt);
      const firstEvent = makeEvent({ id: 'event-1', eventType: 'FutureEvent' });
      const secondEvent = makeEvent({ id: 'event-2', eventType: 'FutureEvent' });
      const updateMany = jest.fn().mockImplementation(async (call: OutboxUpdateCall) => {
        if (!call.where.id) return { count: 0 };
        if (call.where.id === firstEvent.id && call.data.status === 'SKIPPED') {
          jest.setSystemTime(new Date(startedAt.getTime() + 55_000));
        }
        return { count: 1 };
      });
      const prisma = {
        outboxEvent: {
          findMany: jest.fn().mockResolvedValue([firstEvent, secondEvent]),
          updateMany,
        },
      } as unknown as PrismaService;
      const notifications = createNotificationService();
      const service = new OutboxDispatcherService(prisma, notifications.service);

      await expect(service.processBatch()).resolves.toBe(2);

      const claimCalls = updateMany.mock.calls
        .map(([call]) => call as OutboxUpdateCall)
        .filter((call) => call.data.status === 'PROCESSING');
      expect(claimCalls).toHaveLength(2);
      expect(claimCalls[0].data.availableAt?.getTime()).toBe(startedAt.getTime() + 60_000);
      expect(claimCalls[1].data.availableAt?.getTime()).toBe(startedAt.getTime() + 115_000);
    } finally {
      jest.useRealTimers();
    }
  });

  it('skips a known event whose aggregate identity does not match its payload', async () => {
    const reviewLookup = jest.fn();
    const event = makeEvent({
      eventType: 'ReviewTaskCreated',
      aggregateId: 'task-1',
      payload: { taskId: 'task-2', password: 'must-not-leak' },
    });
    const harness = createHarness(event, {
      reviewTask: { findUnique: reviewLookup, findFirst: jest.fn() },
    });
    const notifications = createNotificationService();
    const service = new OutboxDispatcherService(harness.prisma, notifications.service);

    await service.processBatch();

    expect(reviewLookup).not.toHaveBeenCalled();
    expect(harness.upsertNotification).not.toHaveBeenCalled();
    expect(harness.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SKIPPED',
          lastError: 'INVALID_EVENT_PAYLOAD',
        }),
      }),
    );
    expect(JSON.stringify(harness.updateMany.mock.calls)).not.toContain('must-not-leak');
  });

  it('skips a known event whose aggregate type violates the event contract', async () => {
    const event = makeEvent({
      eventType: 'ReviewTaskCreated',
      aggregateType: 'project',
      aggregateId: 'task-1',
      payload: { taskId: 'task-1' },
    });
    const harness = createHarness(event);
    const notifications = createNotificationService();
    const service = new OutboxDispatcherService(harness.prisma, notifications.service);

    await service.processBatch();

    expect(harness.upsertNotification).not.toHaveBeenCalled();
    expect(harness.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SKIPPED',
          lastError: 'INVALID_EVENT_AGGREGATE_TYPE',
        }),
      }),
    );
  });

  it('never forwards arbitrary event payload fields into a notification', async () => {
    const event = makeEvent({
      eventType: 'ReviewTaskCreated',
      aggregateId: 'task-1',
      payload: { taskId: 'task-1', accessToken: 'must-not-leak' },
    });
    const harness = createHarness(event, {
      reviewTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          title: '设计文件审核',
          steps: [{ assignees: [{ assigneeUserId: 'reviewer-1' }] }],
        }),
      },
    });
    const notifications = createNotificationService();
    const service = new OutboxDispatcherService(harness.prisma, notifications.service);

    await service.processBatch();

    expect(harness.upsertNotification).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(harness.upsertNotification.mock.calls)).not.toContain('must-not-leak');
    expect(JSON.stringify(notifications.resolve.mock.calls)).not.toContain('must-not-leak');
  });

  it('bounds generated notification text to the database column limits', async () => {
    const event = makeEvent({
      eventType: 'ReviewTaskCreated',
      aggregateId: 'task-1',
    });
    const harness = createHarness(event, {
      reviewTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          title: '审'.repeat(200),
          steps: [{ assignees: [{ assigneeUserId: 'reviewer-1' }] }],
        }),
      },
    });
    const notifications = createNotificationService();
    notifications.resolve.mockImplementationOnce(async (input) => ({
      title: input.title,
      content: '📄'.repeat(20_000),
      channels: ['IN_APP'],
    }));
    const service = new OutboxDispatcherService(harness.prisma, notifications.service);

    await service.processBatch();

    const call = harness.upsertNotification.mock.calls[0][0] as NotificationUpsertCall & {
      create: { content: string };
    };
    expect(Array.from(call.create.title)).toHaveLength(200);
    expect(Array.from(call.create.content)).toHaveLength(16_000);
  });

  it('fences notification writes when another worker has recovered the lease', async () => {
    const event = makeEvent({
      eventType: 'ReviewTaskCreated',
      aggregateId: 'task-1',
    });
    const upsertNotification = jest.fn();
    const updateMany = jest.fn().mockImplementation(async (call: OutboxUpdateCall) => {
      if (!call.where.id) return { count: 0 };
      if (call.where.status === 'PENDING') return { count: 1 };
      if (call.where.status === 'PROCESSING' && call.data.status === undefined) {
        return { count: 0 };
      }
      return { count: 0 };
    });
    const prisma = {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([event]),
        updateMany,
      },
      reviewTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          title: '设计文件审核',
          steps: [{ assignees: [{ assigneeUserId: 'reviewer-1' }] }],
        }),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'reviewer-1' }]) },
      notificationDelivery: createNotificationDeliveryModel(),
      notification: { upsert: upsertNotification },
    } as unknown as PrismaService;
    const notifications = createNotificationService();
    const service = new OutboxDispatcherService(prisma, notifications.service);

    await expect(service.processBatch()).resolves.toBe(1);

    expect(upsertNotification).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: event.id,
          status: 'PROCESSING',
          attempts: 1,
        }),
        data: expect.objectContaining({
          status: 'PENDING',
          lastError: 'OUTBOX_LEASE_LOST',
        }),
      }),
    );
  });

  it('returns a failed delivery to pending with a safe code and exponential delay', async () => {
    const event = makeEvent({ eventType: 'ReviewTaskRejected', aggregateId: 'task-1' });
    const harness = createHarness(event, {
      reviewTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          title: '设计文件审核',
          submittedBy: 'submitter-1',
        }),
      },
    });
    const notifications = createNotificationService();
    notifications.resolve.mockRejectedValue(new Error('sensitive upstream detail'));
    const service = new OutboxDispatcherService(harness.prisma, notifications.service);
    const startedAt = Date.now();

    await expect(service.processBatch()).resolves.toBe(1);

    const retryCall = harness.updateMany.mock.calls
      .map(([call]) => call as OutboxUpdateCall)
      .find((call) => call.data.status === 'PENDING' && call.where.id === event.id);
    expect(retryCall).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          lastError: 'OUTBOX_DISPATCH_FAILED',
          processedAt: null,
          availableAt: expect.any(Date),
        }),
      }),
    );
    expect(retryCall?.data.availableAt?.getTime()).toBeGreaterThanOrEqual(startedAt + 4_000);
    expect(JSON.stringify(retryCall)).not.toContain('sensitive upstream detail');
  });

  it('moves an event to dead after the maximum delivery attempt', async () => {
    const event = makeEvent({
      eventType: 'ReviewTaskApproved',
      aggregateId: 'task-1',
      attempts: 4,
    });
    const harness = createHarness(event, {
      reviewTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          title: '设计文件审核',
          submittedBy: 'submitter-1',
        }),
      },
    });
    const notifications = createNotificationService();
    notifications.resolve.mockRejectedValue(new Error('delivery failed'));
    const service = new OutboxDispatcherService(harness.prisma, notifications.service);

    await service.processBatch();

    expect(harness.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: event.id, attempts: 5 }),
        data: expect.objectContaining({
          status: 'DEAD',
          lastError: 'OUTBOX_DISPATCH_FAILED',
          processedAt: null,
        }),
      }),
    );
  });

  it('recovers expired leases and terminally closes exhausted events', async () => {
    const event = makeEvent({ eventType: 'FutureEvent' });
    const harness = createHarness(event);
    const notifications = createNotificationService();
    const service = new OutboxDispatcherService(harness.prisma, notifications.service);

    await expect(service.processBatch(20, () => true)).resolves.toBe(0);

    const recoveryCalls = harness.updateMany.mock.calls
      .map(([call]) => call as OutboxUpdateCall)
      .filter((call) => !call.where.id);
    expect(recoveryCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING', attempts: { gte: 5 } }),
          data: expect.objectContaining({
            status: 'DEAD',
            lastError: 'OUTBOX_MAX_ATTEMPTS_EXCEEDED',
          }),
        }),
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PROCESSING', attempts: { gte: 5 } }),
          data: expect.objectContaining({
            status: 'DEAD',
            lastError: 'OUTBOX_LEASE_EXPIRED_MAX_ATTEMPTS',
          }),
        }),
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PROCESSING', attempts: { lt: 5 } }),
          data: expect.objectContaining({
            status: 'PENDING',
            lastError: 'OUTBOX_LEASE_EXPIRED',
          }),
        }),
      ]),
    );
  });

  it('reuses the same notification key when an event retries after delivery', async () => {
    const event = makeEvent({ eventType: 'ReviewTaskApproved', aggregateId: 'task-1' });
    let failedCompletionOnce = false;
    const persistedKeys = new Set<string>();
    const upsertNotification = jest
      .fn()
      .mockImplementation(async (call: NotificationUpsertCall) => {
        persistedKeys.add(call.where.deduplicationKey);
        return { id: call.where.deduplicationKey };
      });
    const updateMany = jest.fn().mockImplementation(async (call: OutboxUpdateCall) => {
      if (!call.where.id) return { count: 0 };
      if (call.where.status === 'PENDING') return { count: 1 };
      if (call.data.status === 'PROCESSED' && !failedCompletionOnce) {
        failedCompletionOnce = true;
        throw new Error('status persistence failed');
      }
      return { count: 1 };
    });
    const prisma = {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([event]),
        updateMany,
      },
      reviewTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          title: '设计文件审核',
          submittedBy: 'submitter-1',
        }),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'submitter-1' }]) },
      notificationDelivery: createNotificationDeliveryModel(),
      notification: { upsert: upsertNotification },
    } as unknown as PrismaService;
    const notifications = createNotificationService();
    const service = new OutboxDispatcherService(prisma, notifications.service);

    await service.processBatch();
    await service.processBatch();

    expect(upsertNotification).toHaveBeenCalledTimes(2);
    expect(persistedKeys).toEqual(new Set([`${event.id}:submitter-1:IN_APP`]));
  });

  it('notifies only active assignees on the current review step', async () => {
    const event = makeEvent({ eventType: 'ReviewTaskCreated', aggregateId: 'task-1' });
    const harness = createHarness(event, {
      reviewTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          title: '设备清单审核',
          steps: [
            {
              assignees: [
                { assigneeUserId: 'reviewer-active' },
                { assigneeUserId: 'reviewer-inactive' },
              ],
            },
          ],
        }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'reviewer-active' }]),
      },
    });
    const notifications = createNotificationService();
    const service = new OutboxDispatcherService(harness.prisma, notifications.service);

    await service.processBatch();

    expect(harness.upsertNotification).toHaveBeenCalledTimes(1);
    expect(harness.upsertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 'reviewer-active',
          notificationType: 'review_pending',
          relatedId: 'task-1',
        }),
      }),
    );
  });

  it('notifies project owners and members while excluding the triggering actor', async () => {
    const event = makeEvent({
      eventType: 'ProjectStageChanged',
      aggregateId: 'project-1',
      payload: { projectId: 'project-1', changedBy: 'manager-1' },
    });
    const harness = createHarness(event, {
      project: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'project-1',
          projectCode: 'PRJ-001',
          projectName: '华东交付项目',
          salesOwnerId: null,
          projectManagerId: 'manager-1',
          electricalOwnerId: 'electric-1',
          softwareOwnerId: null,
          members: [{ userId: 'member-1' }, { userId: 'electric-1' }],
        }),
      },
    });
    const notifications = createNotificationService();
    const service = new OutboxDispatcherService(harness.prisma, notifications.service);

    await service.processBatch();

    const recipients = harness.upsertNotification.mock.calls.map(
      ([call]) => (call as NotificationUpsertCall).create.userId,
    );
    expect(recipients.sort()).toEqual(['electric-1', 'member-1']);
  });

  it('lets the review-task event supersede an archive-upload notification', async () => {
    const event = makeEvent({
      eventType: 'ArchiveFileUploaded',
      aggregateId: 'logical-file-1',
      payload: {
        logicalFileId: 'logical-file-1',
        fileVersionId: 'file-version-1',
        uploadedBy: 'uploader-1',
      },
    });
    const harness = createHarness(event, {
      reviewTask: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ id: 'review-task-1' }),
      },
    });
    const notifications = createNotificationService();
    const service = new OutboxDispatcherService(harness.prisma, notifications.service);

    await service.processBatch();

    expect(harness.upsertNotification).not.toHaveBeenCalled();
    expect(harness.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SKIPPED',
          lastError: 'REVIEW_TASK_NOTIFICATION_SUPERSEDES_UPLOAD',
        }),
      }),
    );
  });

  it('notifies archive and project owners when an uploaded archive file needs no review', async () => {
    const event = makeEvent({
      eventType: 'ArchiveFileUploaded',
      aggregateId: 'logical-file-1',
      payload: {
        logicalFileId: 'logical-file-1',
        fileVersionId: 'file-version-1',
        uploadedBy: 'uploader-1',
      },
    });
    const harness = createHarness(event, {
      projectArchiveFile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'archive-file-1',
          archiveItem: { name: '设计图纸', ownerUserId: 'archive-owner' },
          project: {
            id: 'project-1',
            projectCode: 'PRJ-001',
            projectName: '华东交付项目',
            salesOwnerId: null,
            projectManagerId: 'project-manager',
            electricalOwnerId: null,
            softwareOwnerId: null,
            members: [{ userId: 'project-member' }, { userId: 'uploader-1' }],
          },
        }),
      },
    });
    const notifications = createNotificationService();
    const service = new OutboxDispatcherService(harness.prisma, notifications.service);

    await service.processBatch();

    const recipients = harness.upsertNotification.mock.calls.map(
      ([call]) => (call as NotificationUpsertCall).create.userId,
    );
    expect(recipients.sort()).toEqual(['archive-owner', 'project-manager', 'project-member']);
  });

  it('routes file and published events to uploaders, submitters and creators', async () => {
    const cases: Array<{
      event: EventRow;
      overrides: Record<string, unknown>;
      expectedUsers: string[];
    }> = [
      {
        event: makeEvent({ eventType: 'FileProcessingCompleted', aggregateId: 'asset-1' }),
        overrides: {
          fileAsset: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'asset-1',
              originalName: '设计图.png',
              createdBy: 'uploader-1',
            }),
          },
        },
        expectedUsers: ['uploader-1'],
      },
      {
        event: makeEvent({ eventType: 'StandardPublished', aggregateId: 'standard-version-1' }),
        overrides: {
          standardVersion: {
            findUnique: jest.fn().mockResolvedValue({
              version: 'V1.0',
              submittedBy: 'standard-submitter',
              standard: { id: 'standard-1', name: '交付标准', createdBy: 'standard-creator' },
            }),
          },
        },
        expectedUsers: ['standard-creator', 'standard-submitter'],
      },
      {
        event: makeEvent({ eventType: 'KnowledgePublished', aggregateId: 'knowledge-version-1' }),
        overrides: {
          knowledgeVersion: {
            findUnique: jest.fn().mockResolvedValue({
              version: 'V2.0',
              submittedBy: 'knowledge-submitter',
              knowledgeItem: {
                id: 'knowledge-1',
                title: '现场调试指南',
                createdBy: 'knowledge-creator',
              },
            }),
          },
        },
        expectedUsers: ['knowledge-creator', 'knowledge-submitter'],
      },
      {
        event: makeEvent({
          eventType: 'ArchiveTemplatePublished',
          aggregateId: 'archive-version-1',
        }),
        overrides: {
          archiveTemplateVersion: {
            findUnique: jest.fn().mockResolvedValue({
              versionNo: 'V3.0',
              createdBy: 'archive-version-creator',
              template: {
                id: 'archive-template-1',
                templateName: '海外项目档案',
                createdBy: 'archive-template-creator',
              },
            }),
          },
          reviewTask: {
            findUnique: jest.fn().mockResolvedValue(null),
            findFirst: jest.fn().mockResolvedValue({ submittedBy: 'archive-submitter' }),
          },
        },
        expectedUsers: ['archive-submitter', 'archive-template-creator', 'archive-version-creator'],
      },
    ];

    for (const item of cases) {
      const harness = createHarness(item.event, item.overrides);
      const notifications = createNotificationService();
      const service = new OutboxDispatcherService(harness.prisma, notifications.service);
      await service.processBatch();
      const recipients = harness.upsertNotification.mock.calls.map(
        ([call]) => (call as NotificationUpsertCall).create.userId,
      );
      expect(recipients.sort()).toEqual(item.expectedUsers.sort());
    }
  });

  it('delivers every configured channel and stores durable receipts', async () => {
    const event = makeEvent({ eventType: 'ReviewTaskCreated', aggregateId: 'task-1' });
    const deliveryModel = createNotificationDeliveryModel();
    const harness = createHarness(event, {
      reviewTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          title: '设计文件审核',
          steps: [{ assignees: [{ assigneeUserId: 'reviewer-1' }] }],
        }),
      },
      notificationDelivery: deliveryModel,
      externalIdentity: {
        findFirst: jest.fn().mockImplementation(({ where }: { where: { provider: string } }) => ({
          externalUserId: `${where.provider.toLowerCase()}-user-1`,
          identifierType: where.provider === 'FEISHU' ? 'OPEN_ID' : 'USER_ID',
        })),
      },
    });
    const notifications = createNotificationService();
    notifications.resolve.mockResolvedValue({
      title: '待审核',
      content: '请处理',
      channels: ['IN_APP', 'FEISHU', 'WECOM'],
    });
    const sendNotification = jest.fn().mockImplementation(({ provider }: { provider: string }) => ({
      provider,
      receiptId: `${provider.toLowerCase()}-receipt-1`,
    }));
    const integrations = { sendNotification } as unknown as IntegrationService;
    const service = new OutboxDispatcherService(
      harness.prisma,
      notifications.service,
      integrations,
    );

    await expect(service.processBatch()).resolves.toBe(1);

    expect(harness.upsertNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'FEISHU',
        recipientId: 'feishu-user-1',
        idempotencyKey: `${event.id}:reviewer-1:FEISHU`,
      }),
    );
    expect(deliveryModel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SENT',
          receiptId: 'wecom-receipt-1',
        }),
      }),
    );
  });

  it('marks an external-only event skipped when no external identity exists', async () => {
    const event = makeEvent({ eventType: 'ReviewTaskCreated', aggregateId: 'task-1' });
    const deliveryModel = createNotificationDeliveryModel();
    const harness = createHarness(event, {
      reviewTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          title: '设计文件审核',
          steps: [{ assignees: [{ assigneeUserId: 'reviewer-1' }] }],
        }),
      },
      notificationDelivery: deliveryModel,
      externalIdentity: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const notifications = createNotificationService();
    notifications.resolve.mockResolvedValue({
      title: '待审核',
      content: '请处理',
      channels: ['FEISHU'],
    });
    const service = new OutboxDispatcherService(harness.prisma, notifications.service);

    await service.processBatch();

    expect(deliveryModel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SKIPPED',
          errorCode: 'EXTERNAL_IDENTITY_NOT_FOUND',
        }),
      }),
    );
    expect(harness.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SKIPPED',
          lastError: 'ALL_NOTIFICATION_DELIVERIES_SKIPPED',
        }),
      }),
    );
  });

  it('records a permanent missing integration configuration as a channel skip', async () => {
    const event = makeEvent({ eventType: 'ReviewTaskCreated', aggregateId: 'task-1' });
    const deliveryModel = createNotificationDeliveryModel();
    const harness = createHarness(event, {
      reviewTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          title: '设计文件审核',
          steps: [{ assignees: [{ assigneeUserId: 'reviewer-1' }] }],
        }),
      },
      notificationDelivery: deliveryModel,
      externalIdentity: {
        findFirst: jest.fn().mockResolvedValue({
          externalUserId: 'open-id-1',
          identifierType: 'OPEN_ID',
        }),
      },
    });
    const notifications = createNotificationService();
    notifications.resolve.mockResolvedValue({
      title: '待审核',
      content: '请处理',
      channels: ['FEISHU'],
    });
    const integrations = {
      sendNotification: jest
        .fn()
        .mockRejectedValue(new IntegrationDeliveryError('INTEGRATION_CONFIG_UNAVAILABLE', false)),
    } as unknown as IntegrationService;
    const service = new OutboxDispatcherService(
      harness.prisma,
      notifications.service,
      integrations,
    );

    await service.processBatch();

    expect(deliveryModel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SKIPPED',
          errorCode: 'INTEGRATION_CONFIG_UNAVAILABLE',
        }),
      }),
    );
    expect(harness.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SKIPPED' }),
      }),
    );
  });

  it('retries a transient external failure with its stable error code', async () => {
    const event = makeEvent({ eventType: 'ReviewTaskCreated', aggregateId: 'task-1' });
    const deliveryModel = createNotificationDeliveryModel();
    const harness = createHarness(event, {
      reviewTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          title: '设计文件审核',
          steps: [{ assignees: [{ assigneeUserId: 'reviewer-1' }] }],
        }),
      },
      notificationDelivery: deliveryModel,
      externalIdentity: {
        findFirst: jest.fn().mockResolvedValue({
          externalUserId: 'open-id-1',
          identifierType: 'OPEN_ID',
        }),
      },
    });
    const notifications = createNotificationService();
    notifications.resolve.mockResolvedValue({
      title: '待审核',
      content: '请处理',
      channels: ['FEISHU'],
    });
    const integrations = {
      sendNotification: jest
        .fn()
        .mockRejectedValue(new IntegrationDeliveryError('INTEGRATION_REQUEST_TIMEOUT', true)),
    } as unknown as IntegrationService;
    const service = new OutboxDispatcherService(
      harness.prisma,
      notifications.service,
      integrations,
    );

    await service.processBatch();

    expect(deliveryModel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorCode: 'INTEGRATION_REQUEST_TIMEOUT',
        }),
      }),
    );
    expect(harness.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          lastError: 'INTEGRATION_REQUEST_TIMEOUT',
        }),
      }),
    );
  });
});

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  const eventType = overrides.eventType ?? 'ReviewTaskCreated';
  const aggregateId = overrides.aggregateId ?? 'aggregate-1';
  return {
    id: 'event-1',
    eventType,
    aggregateType: overrides.aggregateType ?? aggregateTypeFor(eventType),
    aggregateId,
    payload: overrides.payload ?? payloadFor(eventType, aggregateId),
    attempts: 0,
    ...overrides,
  };
}

function aggregateTypeFor(eventType: string): string {
  if (eventType.startsWith('ReviewTask')) return 'review_task';
  if (eventType.startsWith('Project')) return 'project';
  if (eventType === 'FileProcessingCompleted') return 'file_asset';
  if (eventType === 'StandardPublished') return 'standard';
  if (eventType === 'KnowledgePublished') return 'knowledge';
  if (eventType === 'ArchiveTemplatePublished') return 'archive_template';
  if (eventType === 'ArchiveFileUploaded') return 'logical_file';
  if (eventType === 'CurrencyRateUpdated') return 'currency';
  return 'future';
}

function payloadFor(eventType: string, aggregateId: string): Prisma.JsonValue {
  if (eventType.startsWith('ReviewTask')) return { taskId: aggregateId };
  if (eventType.startsWith('Project')) return { projectId: aggregateId };
  if (eventType === 'FileProcessingCompleted') return { inputAssetId: aggregateId };
  if (['StandardPublished', 'KnowledgePublished', 'ArchiveTemplatePublished'].includes(eventType)) {
    return { sourceId: aggregateId };
  }
  if (eventType === 'ArchiveFileUploaded') {
    return {
      logicalFileId: aggregateId,
      fileVersionId: 'file-version-1',
      uploadedBy: 'uploader-1',
    };
  }
  if (eventType === 'CurrencyRateUpdated') return { baseCurrency: aggregateId };
  return {};
}

function createHarness(event: EventRow, overrides: Record<string, unknown> = {}) {
  const updateMany = jest.fn().mockImplementation(async (call: OutboxUpdateCall) => {
    if (!call.where.id) return { count: 0 };
    return { count: 1 };
  });
  const upsertNotification = jest.fn().mockResolvedValue({ id: 'notification-1' });
  const prismaObject = {
    outboxEvent: {
      findMany: jest.fn().mockResolvedValue([event]),
      updateMany,
    },
    reviewTask: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    project: { findFirst: jest.fn().mockResolvedValue(null) },
    fileAsset: { findUnique: jest.fn().mockResolvedValue(null) },
    standardVersion: { findUnique: jest.fn().mockResolvedValue(null) },
    knowledgeVersion: { findUnique: jest.fn().mockResolvedValue(null) },
    archiveTemplateVersion: { findUnique: jest.fn().mockResolvedValue(null) },
    projectArchiveFile: { findUnique: jest.fn().mockResolvedValue(null) },
    user: {
      findMany: jest
        .fn()
        .mockImplementation(async (call: UserFindCall) => call.where.id.in.map((id) => ({ id }))),
    },
    notificationDelivery: createNotificationDeliveryModel(),
    notification: { upsert: upsertNotification },
    ...overrides,
  };
  return {
    prisma: prismaObject as unknown as PrismaService,
    updateMany,
    upsertNotification,
  };
}

function createNotificationService() {
  const resolve = jest.fn().mockImplementation(async (input: NotificationEventInput) => ({
    title: input.title,
    content: input.content,
    channels: ['IN_APP'],
  }));
  return {
    resolve,
    service: { resolveDeliveryPlan: resolve } as unknown as NotificationService,
  };
}

function createNotificationDeliveryModel() {
  return {
    upsert: jest
      .fn()
      .mockImplementation(
        ({ where }: { where: { eventId_userId_channel: { channel: string } } }) => ({
          id: `delivery-${where.eventId_userId_channel.channel}`,
          status: 'PENDING',
        }),
      ),
    update: jest.fn().mockResolvedValue({}),
  };
}
