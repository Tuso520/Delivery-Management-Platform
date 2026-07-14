import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import type { NotificationChannel } from '../notification/dto/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { IntegrationDeliveryError, IntegrationService } from '../platform/integration.service';

const OUTBOX_MAX_ATTEMPTS = 5;
const OUTBOX_LEASE_MS = 60_000;
const OUTBOX_RETRY_BASE_MS = 5_000;
const OUTBOX_RETRY_MAX_MS = 15 * 60_000;

const EVENT_AGGREGATE_TYPES = {
  ReviewTaskCreated: 'review_task',
  ReviewTaskRejected: 'review_task',
  ReviewTaskApproved: 'review_task',
  ProjectCreated: 'project',
  ProjectStageChanged: 'project',
  ProjectAccepted: 'project',
  ProjectArchived: 'project',
  FileProcessingCompleted: 'file_asset',
  StandardPublished: 'standard',
  KnowledgePublished: 'knowledge',
  ArchiveTemplatePublished: 'archive_template',
  ArchiveFileUploaded: 'logical_file',
  CurrencyRateUpdated: 'currency',
} as const;

const EVENT_IDENTITY_PAYLOAD_KEYS: Record<keyof typeof EVENT_AGGREGATE_TYPES, string> = {
  ReviewTaskCreated: 'taskId',
  ReviewTaskRejected: 'taskId',
  ReviewTaskApproved: 'taskId',
  ProjectCreated: 'projectId',
  ProjectStageChanged: 'projectId',
  ProjectAccepted: 'projectId',
  ProjectArchived: 'projectId',
  FileProcessingCompleted: 'inputAssetId',
  StandardPublished: 'sourceId',
  KnowledgePublished: 'sourceId',
  ArchiveTemplatePublished: 'sourceId',
  ArchiveFileUploaded: 'logicalFileId',
  CurrencyRateUpdated: 'baseCurrency',
};

class OutboxLeaseLostError extends Error {}

interface ClaimedOutboxEvent {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
  attempts: number;
}

interface NotificationEnvelope {
  userIds: string[];
  title: string;
  content: string;
  notificationType: string;
  relatedType: string;
  relatedId: string;
  variables?: Record<string, string>;
}

interface DispatchOutcome {
  status: 'PROCESSED' | 'SKIPPED';
  auditCode?: string;
}

interface DeliverySummary {
  attempted: number;
  sent: number;
  skipped: number;
}

@Injectable()
export class OutboxDispatcherService {
  private readonly logger = new Logger(OutboxDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    @Optional() private readonly integrations?: IntegrationService,
  ) {}

  async processBatch(limit = 20, shouldStop: () => boolean = () => false): Promise<number> {
    const batchSize = Math.max(1, Math.min(limit, 100));
    const now = new Date();
    await this.recoverExpiredClaims(now);

    const candidates = await this.prisma.outboxEvent.findMany({
      where: {
        status: 'PENDING',
        availableAt: { lte: now },
        attempts: { lt: OUTBOX_MAX_ATTEMPTS },
      },
      select: {
        id: true,
        eventType: true,
        aggregateType: true,
        aggregateId: true,
        payload: true,
        attempts: true,
      },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      take: batchSize,
    });

    let claimedCount = 0;
    for (const candidate of candidates) {
      if (shouldStop()) break;
      const claimTime = new Date();
      const claimedAttempts = candidate.attempts + 1;
      const claimed = await this.prisma.outboxEvent.updateMany({
        where: {
          id: candidate.id,
          status: 'PENDING',
          availableAt: { lte: claimTime },
          attempts: candidate.attempts,
        },
        data: {
          status: 'PROCESSING',
          attempts: { increment: 1 },
          availableAt: new Date(claimTime.getTime() + OUTBOX_LEASE_MS),
          lastError: null,
          processedAt: null,
        },
      });
      if (claimed.count !== 1) continue;

      claimedCount += 1;
      const event: ClaimedOutboxEvent = {
        ...candidate,
        attempts: claimedAttempts,
      };
      try {
        const outcome = await this.dispatch(event);
        await this.prisma.outboxEvent.updateMany({
          where: {
            id: event.id,
            status: 'PROCESSING',
            attempts: event.attempts,
          },
          data: {
            status: outcome.status,
            processedAt: new Date(),
            lastError: outcome.auditCode ?? null,
          },
        });
      } catch (error) {
        await this.recordFailure(event, error);
      }
    }
    return claimedCount;
  }

  private async recoverExpiredClaims(now: Date): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: {
        status: 'PENDING',
        attempts: { gte: OUTBOX_MAX_ATTEMPTS },
      },
      data: {
        status: 'DEAD',
        lastError: 'OUTBOX_MAX_ATTEMPTS_EXCEEDED',
      },
    });
    await this.prisma.outboxEvent.updateMany({
      where: {
        status: 'PROCESSING',
        availableAt: { lte: now },
        attempts: { gte: OUTBOX_MAX_ATTEMPTS },
      },
      data: {
        status: 'DEAD',
        lastError: 'OUTBOX_LEASE_EXPIRED_MAX_ATTEMPTS',
      },
    });
    await this.prisma.outboxEvent.updateMany({
      where: {
        status: 'PROCESSING',
        availableAt: { lte: now },
        attempts: { lt: OUTBOX_MAX_ATTEMPTS },
      },
      data: {
        status: 'PENDING',
        lastError: 'OUTBOX_LEASE_EXPIRED',
      },
    });
  }

  private async recordFailure(event: ClaimedOutboxEvent, error: unknown): Promise<void> {
    const errorCode = this.safeErrorCode(error);
    const isDead = event.attempts >= OUTBOX_MAX_ATTEMPTS;
    const delayMs = Math.min(
      OUTBOX_RETRY_BASE_MS * 2 ** Math.max(0, event.attempts - 1),
      OUTBOX_RETRY_MAX_MS,
    );
    await this.prisma.outboxEvent.updateMany({
      where: {
        id: event.id,
        status: 'PROCESSING',
        attempts: event.attempts,
      },
      data: {
        status: isDead ? 'DEAD' : 'PENDING',
        availableAt: isDead ? undefined : new Date(Date.now() + delayMs),
        lastError: errorCode,
        processedAt: null,
      },
    });
    this.logger.warn(
      `Outbox event ${event.id} (${event.eventType}) failed with ${errorCode} on attempt ${event.attempts}`,
    );
  }

  private safeErrorCode(error: unknown): string {
    if (error instanceof OutboxLeaseLostError) return 'OUTBOX_LEASE_LOST';
    if (error instanceof IntegrationDeliveryError) return error.code;
    return error instanceof Prisma.PrismaClientKnownRequestError
      ? 'OUTBOX_PERSISTENCE_FAILED'
      : 'OUTBOX_DISPATCH_FAILED';
  }

  private async dispatch(event: ClaimedOutboxEvent): Promise<DispatchOutcome> {
    const validationError = this.validateEvent(event);
    if (validationError) {
      return { status: 'SKIPPED', auditCode: validationError };
    }
    switch (event.eventType) {
      case 'ReviewTaskCreated':
        return this.dispatchReviewTaskCreated(event);
      case 'ReviewTaskRejected':
      case 'ReviewTaskApproved':
        return this.dispatchReviewTaskDecision(event);
      case 'ProjectCreated':
      case 'ProjectStageChanged':
      case 'ProjectAccepted':
      case 'ProjectArchived':
        return this.dispatchProjectEvent(event);
      case 'FileProcessingCompleted':
        return this.dispatchFileProcessingCompleted(event);
      case 'StandardPublished':
        return this.dispatchStandardPublished(event);
      case 'KnowledgePublished':
        return this.dispatchKnowledgePublished(event);
      case 'ArchiveTemplatePublished':
        return this.dispatchArchiveTemplatePublished(event);
      case 'ArchiveFileUploaded':
        return this.dispatchArchiveFileUploaded(event);
      case 'CurrencyRateUpdated':
        return { status: 'PROCESSED' };
      default:
        return { status: 'SKIPPED', auditCode: 'UNSUPPORTED_EVENT_TYPE' };
    }
  }

  private async dispatchReviewTaskCreated(event: ClaimedOutboxEvent): Promise<DispatchOutcome> {
    const task = await this.prisma.reviewTask.findUnique({
      where: { id: event.aggregateId },
      select: {
        id: true,
        title: true,
        steps: {
          where: { status: 'ACTIVE' },
          select: {
            assignees: {
              where: { status: 'PENDING' },
              select: { assigneeUserId: true },
            },
          },
        },
      },
    });
    if (!task) {
      return { status: 'SKIPPED', auditCode: 'REVIEW_TASK_AGGREGATE_UNAVAILABLE' };
    }
    return this.deliver(event, {
      userIds: task.steps.flatMap((step) =>
        step.assignees.map((assignee) => assignee.assigneeUserId),
      ),
      title: `待审核：${task.title}`,
      content: '审核任务已提交，请处理当前审核步骤。',
      notificationType: 'review_pending',
      relatedType: 'ReviewTask',
      relatedId: task.id,
      variables: { taskTitle: task.title },
    });
  }

  private async dispatchReviewTaskDecision(event: ClaimedOutboxEvent): Promise<DispatchOutcome> {
    const task = await this.prisma.reviewTask.findUnique({
      where: { id: event.aggregateId },
      select: { id: true, title: true, submittedBy: true },
    });
    if (!task) {
      return { status: 'SKIPPED', auditCode: 'REVIEW_TASK_AGGREGATE_UNAVAILABLE' };
    }
    const approved = event.eventType === 'ReviewTaskApproved';
    return this.deliver(event, {
      userIds: [task.submittedBy],
      title: `${approved ? '审核已通过' : '审核已驳回'}：${task.title}`,
      content: approved ? '你提交的审核任务已通过。' : '你提交的审核任务已驳回，请查看意见并处理。',
      notificationType: approved ? 'review_approved' : 'review_rejected',
      relatedType: 'ReviewTask',
      relatedId: task.id,
      variables: { taskTitle: task.title },
    });
  }

  private async dispatchProjectEvent(event: ClaimedOutboxEvent): Promise<DispatchOutcome> {
    const project = await this.prisma.project.findFirst({
      where: { id: event.aggregateId, deletedAt: null },
      select: {
        id: true,
        projectCode: true,
        projectName: true,
        salesOwnerId: true,
        projectManagerId: true,
        electricalOwnerId: true,
        softwareOwnerId: true,
        members: { select: { userId: true } },
      },
    });
    if (!project) {
      return { status: 'SKIPPED', auditCode: 'PROJECT_AGGREGATE_UNAVAILABLE' };
    }

    const actorUserId = this.firstPayloadString(event.payload, [
      'createdBy',
      'changedBy',
      'acceptedBy',
      'archivedBy',
    ]);
    const eventCopy = this.projectEventCopy(event.eventType);
    return this.deliver(event, {
      userIds: [
        project.salesOwnerId,
        project.projectManagerId,
        project.electricalOwnerId,
        project.softwareOwnerId,
        ...project.members.map((member) => member.userId),
      ].filter((userId): userId is string => Boolean(userId) && userId !== actorUserId),
      title: `${eventCopy.title}：${project.projectName}`,
      content: `项目 ${project.projectCode} ${eventCopy.content}`,
      notificationType: eventCopy.notificationType,
      relatedType: 'Project',
      relatedId: project.id,
      variables: {
        projectCode: project.projectCode,
        projectName: project.projectName,
      },
    });
  }

  private projectEventCopy(eventType: string): {
    title: string;
    content: string;
    notificationType: string;
  } {
    if (eventType === 'ProjectCreated') {
      return {
        title: '项目已创建',
        content: '已创建，请查看项目安排。',
        notificationType: 'project_created',
      };
    }
    if (eventType === 'ProjectStageChanged') {
      return {
        title: '项目阶段已变更',
        content: '的交付阶段已变更。',
        notificationType: 'project_stage_changed',
      };
    }
    if (eventType === 'ProjectAccepted') {
      return { title: '项目已验收', content: '已完成验收。', notificationType: 'project_accepted' };
    }
    return { title: '项目已归档', content: '已归档。', notificationType: 'project_archived' };
  }

  private async dispatchFileProcessingCompleted(
    event: ClaimedOutboxEvent,
  ): Promise<DispatchOutcome> {
    const asset = await this.prisma.fileAsset.findUnique({
      where: { id: event.aggregateId },
      select: { id: true, originalName: true, createdBy: true },
    });
    if (!asset) {
      return { status: 'SKIPPED', auditCode: 'FILE_ASSET_AGGREGATE_UNAVAILABLE' };
    }
    return this.deliver(event, {
      userIds: [asset.createdBy],
      title: `文件处理完成：${asset.originalName}`,
      content: '文件预览资源已生成，可以重新打开文件查看。',
      notificationType: 'file_processing_completed',
      relatedType: 'FileAsset',
      relatedId: asset.id,
      variables: { fileName: asset.originalName },
    });
  }

  private async dispatchStandardPublished(event: ClaimedOutboxEvent): Promise<DispatchOutcome> {
    const version = await this.prisma.standardVersion.findUnique({
      where: { id: event.aggregateId },
      select: {
        version: true,
        submittedBy: true,
        standard: { select: { id: true, name: true, createdBy: true } },
      },
    });
    if (!version) {
      return { status: 'SKIPPED', auditCode: 'STANDARD_AGGREGATE_UNAVAILABLE' };
    }
    return this.deliver(event, {
      userIds: [version.submittedBy, version.standard.createdBy],
      title: `标准已发布：${version.standard.name}`,
      content: `版本 ${version.version} 已审核通过并发布。`,
      notificationType: 'standard_published',
      relatedType: 'Standard',
      relatedId: version.standard.id,
      variables: { standardName: version.standard.name, version: version.version },
    });
  }

  private async dispatchKnowledgePublished(event: ClaimedOutboxEvent): Promise<DispatchOutcome> {
    const version = await this.prisma.knowledgeVersion.findUnique({
      where: { id: event.aggregateId },
      select: {
        version: true,
        submittedBy: true,
        knowledgeItem: { select: { id: true, title: true, createdBy: true } },
      },
    });
    if (!version) {
      return { status: 'SKIPPED', auditCode: 'KNOWLEDGE_AGGREGATE_UNAVAILABLE' };
    }
    return this.deliver(event, {
      userIds: [version.submittedBy, version.knowledgeItem.createdBy],
      title: `知识已发布：${version.knowledgeItem.title}`,
      content: `版本 ${version.version} 已审核通过并发布。`,
      notificationType: 'knowledge_published',
      relatedType: 'KnowledgeItem',
      relatedId: version.knowledgeItem.id,
      variables: { knowledgeTitle: version.knowledgeItem.title, version: version.version },
    });
  }

  private async dispatchArchiveTemplatePublished(
    event: ClaimedOutboxEvent,
  ): Promise<DispatchOutcome> {
    const version = await this.prisma.archiveTemplateVersion.findUnique({
      where: { id: event.aggregateId },
      select: {
        versionNo: true,
        createdBy: true,
        template: { select: { id: true, templateName: true, createdBy: true } },
      },
    });
    if (!version) {
      return {
        status: 'SKIPPED',
        auditCode: 'ARCHIVE_TEMPLATE_AGGREGATE_UNAVAILABLE',
      };
    }
    const task = await this.prisma.reviewTask.findFirst({
      where: {
        sourceType: 'ARCHIVE_TEMPLATE',
        sourceId: event.aggregateId,
        status: 'APPROVED',
      },
      select: { submittedBy: true },
      orderBy: { completedAt: 'desc' },
    });
    return this.deliver(event, {
      userIds: [version.createdBy, version.template.createdBy, task?.submittedBy].filter(
        (userId): userId is string => Boolean(userId),
      ),
      title: `档案模板已发布：${version.template.templateName}`,
      content: `版本 ${version.versionNo} 已审核通过并发布。`,
      notificationType: 'archive_template_published',
      relatedType: 'ArchiveTemplate',
      relatedId: version.template.id,
      variables: { templateName: version.template.templateName, version: version.versionNo },
    });
  }

  private async dispatchArchiveFileUploaded(event: ClaimedOutboxEvent): Promise<DispatchOutcome> {
    const fileVersionId = this.payloadIdentifier(event.payload, 'fileVersionId');
    if (fileVersionId) {
      const reviewTask = await this.prisma.reviewTask.findFirst({
        where: { fileVersionId },
        select: { id: true },
      });
      if (reviewTask) {
        return { status: 'SKIPPED', auditCode: 'REVIEW_TASK_NOTIFICATION_SUPERSEDES_UPLOAD' };
      }
    }

    const archiveFile = await this.prisma.projectArchiveFile.findUnique({
      where: { logicalFileId: event.aggregateId },
      select: {
        id: true,
        archiveItem: { select: { name: true, ownerUserId: true } },
        project: {
          select: {
            id: true,
            projectCode: true,
            projectName: true,
            salesOwnerId: true,
            projectManagerId: true,
            electricalOwnerId: true,
            softwareOwnerId: true,
            members: { select: { userId: true } },
          },
        },
      },
    });
    if (!archiveFile) {
      return { status: 'SKIPPED', auditCode: 'ARCHIVE_FILE_AGGREGATE_UNAVAILABLE' };
    }

    const uploadedBy = this.payloadIdentifier(event.payload, 'uploadedBy');
    return this.deliver(event, {
      userIds: [
        archiveFile.archiveItem.ownerUserId,
        archiveFile.project.salesOwnerId,
        archiveFile.project.projectManagerId,
        archiveFile.project.electricalOwnerId,
        archiveFile.project.softwareOwnerId,
        ...archiveFile.project.members.map((member) => member.userId),
      ].filter((userId): userId is string => Boolean(userId) && userId !== uploadedBy),
      title: `档案文件已上传：${archiveFile.archiveItem.name}`,
      content: `项目 ${archiveFile.project.projectCode} 的档案项“${archiveFile.archiveItem.name}”已上传新文件。`,
      notificationType: 'archive_file_uploaded',
      relatedType: 'ProjectArchiveFile',
      relatedId: archiveFile.id,
      variables: {
        projectCode: archiveFile.project.projectCode,
        projectName: archiveFile.project.projectName,
        archiveItemName: archiveFile.archiveItem.name,
      },
    });
  }

  private async deliver(
    event: ClaimedOutboxEvent,
    envelope: NotificationEnvelope,
  ): Promise<DispatchOutcome> {
    const userIds = await this.activeUserIds(envelope.userIds);
    const defaultTitle = this.truncateText(envelope.title, 200);
    const defaultContent = this.truncateText(envelope.content, 16_000);
    const summary: DeliverySummary = { attempted: 0, sent: 0, skipped: 0 };
    for (const userId of userIds) {
      const resolved = await this.notifications.resolveDeliveryPlan({
        eventType: event.eventType,
        userId,
        title: defaultTitle,
        content: defaultContent,
        variables: envelope.variables,
      });
      if (!resolved) continue;
      for (const channel of Array.from(new Set(resolved.channels))) {
        summary.attempted += 1;
        const result = await this.deliverChannel(event, userId, channel, {
          ...envelope,
          title: this.truncateText(resolved.title, 200),
          content: this.truncateText(resolved.content, 16_000),
        });
        summary[result === 'SENT' ? 'sent' : 'skipped'] += 1;
      }
    }
    if (summary.sent > 0) return { status: 'PROCESSED' };
    return {
      status: 'SKIPPED',
      auditCode:
        summary.attempted === 0
          ? 'NO_NOTIFICATION_DELIVERY'
          : 'ALL_NOTIFICATION_DELIVERIES_SKIPPED',
    };
  }

  private async deliverChannel(
    event: ClaimedOutboxEvent,
    userId: string,
    channel: NotificationChannel,
    envelope: NotificationEnvelope,
  ): Promise<'SENT' | 'SKIPPED'> {
    const deduplicationKey = `${event.id}:${userId}:${channel}`;
    const delivery = await this.prisma.notificationDelivery.upsert({
      where: {
        eventId_userId_channel: {
          eventId: event.id,
          userId,
          channel,
        },
      },
      create: {
        eventId: event.id,
        userId,
        channel,
        status: 'PENDING',
      },
      update: {},
    });
    if (delivery.status === 'SENT') return 'SENT';
    if (delivery.status === 'SKIPPED') return 'SKIPPED';

    await this.renewLease(event);
    await this.prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'PENDING',
        attempts: { increment: 1 },
        receiptId: null,
        errorCode: null,
      },
    });

    if (channel === 'IN_APP') {
      try {
        const notification = await this.prisma.notification.upsert({
          where: { deduplicationKey },
          create: {
            deduplicationKey,
            userId,
            title: envelope.title,
            content: envelope.content,
            notificationType: envelope.notificationType,
            relatedType: envelope.relatedType,
            relatedId: envelope.relatedId,
          },
          update: {},
        });
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'SENT',
            receiptId: notification.id,
            errorCode: null,
            sentAt: new Date(),
          },
        });
        return 'SENT';
      } catch (error) {
        await this.markDeliveryFailed(delivery.id, 'IN_APP_PERSISTENCE_FAILED');
        throw error;
      }
    }

    const identity = await this.prisma.externalIdentity.findFirst({
      where: { userId, provider: channel, isActive: true },
      select: { externalUserId: true, identifierType: true },
      orderBy: { lastSeenAt: 'desc' },
    });
    if (!identity) {
      await this.markDeliverySkipped(delivery.id, 'EXTERNAL_IDENTITY_NOT_FOUND');
      return 'SKIPPED';
    }
    if (!this.integrations) {
      await this.markDeliverySkipped(delivery.id, 'INTEGRATION_CONFIG_UNAVAILABLE');
      return 'SKIPPED';
    }

    try {
      const receipt = await this.integrations.sendNotification({
        provider: channel,
        recipientId: identity.externalUserId,
        identifierType: identity.identifierType,
        title: envelope.title,
        content: envelope.content,
        idempotencyKey: deduplicationKey,
      });
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SENT',
          receiptId: receipt.receiptId,
          errorCode: null,
          sentAt: new Date(),
        },
      });
      return 'SENT';
    } catch (error) {
      if (error instanceof IntegrationDeliveryError && !error.retryable) {
        await this.markDeliverySkipped(delivery.id, error.code);
        return 'SKIPPED';
      }
      const errorCode =
        error instanceof IntegrationDeliveryError ? error.code : 'INTEGRATION_DELIVERY_FAILED';
      await this.markDeliveryFailed(delivery.id, errorCode);
      throw error instanceof IntegrationDeliveryError
        ? error
        : new IntegrationDeliveryError(errorCode, true);
    }
  }

  private async markDeliverySkipped(deliveryId: string, errorCode: string): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'SKIPPED',
        receiptId: null,
        errorCode,
        sentAt: null,
      },
    });
  }

  private async markDeliveryFailed(deliveryId: string, errorCode: string): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'FAILED',
        receiptId: null,
        errorCode,
        sentAt: null,
      },
    });
  }

  private async renewLease(event: ClaimedOutboxEvent): Promise<void> {
    const renewed = await this.prisma.outboxEvent.updateMany({
      where: {
        id: event.id,
        status: 'PROCESSING',
        attempts: event.attempts,
      },
      data: {
        availableAt: new Date(Date.now() + OUTBOX_LEASE_MS),
      },
    });
    if (renewed.count !== 1) {
      throw new OutboxLeaseLostError();
    }
  }

  private validateEvent(event: ClaimedOutboxEvent): string | null {
    if (!(event.eventType in EVENT_AGGREGATE_TYPES)) return null;
    const eventType = event.eventType as keyof typeof EVENT_AGGREGATE_TYPES;
    if (event.aggregateType !== EVENT_AGGREGATE_TYPES[eventType]) {
      return 'INVALID_EVENT_AGGREGATE_TYPE';
    }
    const identity = this.payloadIdentifier(event.payload, EVENT_IDENTITY_PAYLOAD_KEYS[eventType]);
    if (identity !== event.aggregateId) return 'INVALID_EVENT_PAYLOAD';
    if (
      eventType === 'ArchiveFileUploaded' &&
      (!this.payloadIdentifier(event.payload, 'fileVersionId') ||
        !this.payloadIdentifier(event.payload, 'uploadedBy'))
    ) {
      return 'INVALID_EVENT_PAYLOAD';
    }
    return null;
  }

  private async activeUserIds(candidateIds: string[]): Promise<string[]> {
    const uniqueIds = Array.from(new Set(candidateIds.filter(Boolean)));
    if (uniqueIds.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, status: 'Active', deletedAt: null },
      select: { id: true },
    });
    const activeIds = new Set(users.map((user) => user.id));
    return uniqueIds.filter((userId) => activeIds.has(userId));
  }

  private firstPayloadString(payload: Prisma.JsonValue, keys: string[]): string | null {
    for (const key of keys) {
      const value = this.payloadIdentifier(payload, key);
      if (value) return value;
    }
    return null;
  }

  private payloadString(payload: Prisma.JsonValue, key: string): string | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const value = payload[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private payloadIdentifier(payload: Prisma.JsonValue, key: string): string | null {
    const value = this.payloadString(payload, key);
    return value && value.length <= 36 ? value : null;
  }

  private truncateText(value: string, maxCodePoints: number): string {
    const codePoints = Array.from(value);
    if (codePoints.length <= maxCodePoints) return value;
    return `${codePoints.slice(0, maxCodePoints - 1).join('')}…`;
  }
}
