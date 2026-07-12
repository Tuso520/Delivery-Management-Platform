import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import {
  QueryNotificationDto,
  CreateTargetNotificationRuleDto,
  NotificationChannel,
  NotificationRecipientPolicyDto,
  UpdateTargetNotificationRuleDto,
} from './dto/notification.dto';

export interface NotificationItem {
  id: string;
  title: string;
  content: string;
  notificationType: string;
  relatedType: string | null;
  relatedId: string | null;
  isRead: boolean;
  createdAt: Date;
  readAt: Date | null;
}

export interface NotificationEventInput {
  eventType: string;
  userId: string;
  title: string;
  content: string;
  variables?: Record<string, string>;
}

export interface ResolvedNotificationPlan {
  title: string;
  content: string;
  channels: NotificationChannel[];
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(
    userId: string,
    query: QueryNotificationDto,
  ): Promise<{
    items: NotificationItem[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const { page = 1, pageSize = 20, isRead, notificationType } = query;

    const where: Record<string, unknown> = { userId };

    if (isRead !== undefined && isRead !== '') {
      where.isRead = isRead === 'true';
    }

    if (notificationType) {
      where.notificationType = notificationType;
    }

    const [total, list] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        select: {
          id: true,
          title: true,
          content: true,
          notificationType: true,
          relatedType: true,
          relatedId: true,
          isRead: true,
          createdAt: true,
          readAt: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: list,
      page,
      pageSize,
      total,
    };
  }

  async markAsRead(id: string, userId: string): Promise<NotificationItem> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('通知不存在');
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
      select: {
        id: true,
        title: true,
        content: true,
        notificationType: true,
        relatedType: true,
        relatedId: true,
        isRead: true,
        createdAt: true,
        readAt: true,
      },
    });
  }

  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { count: result.count };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    return { count };
  }

  async resolveDeliveryPlan(
    input: NotificationEventInput,
  ): Promise<ResolvedNotificationPlan | null> {
    const rule = await this.prisma.notificationRule.findFirst({
      where: { eventType: input.eventType, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    if (!rule) {
      return {
        title: input.title,
        content: input.content,
        channels: ['IN_APP'],
      };
    }
    const channels = this.readChannels(rule.channels);
    if (!rule.isEnabled || channels.length === 0) {
      return null;
    }
    const recipientPolicy = this.readRecipientPolicy(rule.recipientPolicy);
    if (recipientPolicy.type === 'ROLE') {
      const matchesRole = await this.prisma.userRole.count({
        where: {
          userId: input.userId,
          role: {
            roleCode: { in: recipientPolicy.values },
            status: 'Active',
          },
        },
      });
      if (matchesRole === 0) {
        return null;
      }
    } else if (recipientPolicy.type === 'USER' && !recipientPolicy.values.includes(input.userId)) {
      return null;
    }
    return {
      title: input.title,
      content: input.content,
      channels,
    };
  }

  async findTargetRules() {
    const rules = await this.prisma.notificationRule.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    return rules.map((rule) => this.toTargetRule(rule));
  }

  async createTargetRule(dto: CreateTargetNotificationRuleDto) {
    const channels = Array.from(new Set(dto.channels));
    const recipientPolicy = this.normalizeRecipientPolicy(dto.recipientPolicy);
    const created = await this.prisma.notificationRule.create({
      data: {
        name: dto.name,
        eventType: dto.eventType,
        channels,
        recipientPolicy: recipientPolicy as unknown as Prisma.InputJsonValue,
        templateId: dto.templateId ?? null,
        isEnabled: dto.enabled ?? true,
      },
    });
    return this.toTargetRule(created);
  }

  async updateTargetRule(id: string, dto: UpdateTargetNotificationRuleDto) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('至少需要提供一个通知规则字段');
    }
    const current = await this.findActiveRule(id);
    const channels = dto.channels ? Array.from(new Set(dto.channels)) : undefined;
    const recipientPolicy = dto.recipientPolicy
      ? this.normalizeRecipientPolicy(dto.recipientPolicy)
      : undefined;
    const updated = await this.prisma.notificationRule.update({
      where: { id: current.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.eventType !== undefined && { eventType: dto.eventType }),
        ...(channels !== undefined && { channels }),
        ...(recipientPolicy !== undefined && {
          recipientPolicy: recipientPolicy as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.templateId !== undefined && {
          templateId: dto.templateId || null,
        }),
        ...(dto.enabled !== undefined && { isEnabled: dto.enabled }),
      },
    });
    return this.toTargetRule(updated);
  }

  async deleteTargetRule(id: string): Promise<void> {
    await this.findActiveRule(id);
    await this.prisma.notificationRule.update({
      where: { id },
      data: { deletedAt: new Date(), isEnabled: false },
    });
  }

  async toggleTargetRule(id: string) {
    const rule = await this.findActiveRule(id);
    const updated = await this.prisma.notificationRule.update({
      where: { id },
      data: { isEnabled: !rule.isEnabled },
    });
    return this.toTargetRule(updated);
  }

  private async findActiveRule(id: string) {
    const rule = await this.prisma.notificationRule.findFirst({
      where: { id, deletedAt: null },
    });
    if (!rule) throw new NotFoundException('通知规则不存在');
    return rule;
  }

  private normalizeChannel(channel: string): NotificationChannel {
    const normalized = channel.trim().toUpperCase();
    if (normalized === 'IN_APP') return 'IN_APP';
    if (normalized === 'FEISHU') return 'FEISHU';
    if (normalized === 'WECOM') return 'WECOM';
    throw new BadRequestException('通知渠道仅支持 IN_APP、FEISHU、WECOM');
  }

  private normalizeRecipientPolicy(policy: NotificationRecipientPolicyDto): {
    type: NotificationRecipientPolicyDto['type'];
    values: string[];
  } {
    const values = Array.from(
      new Set((policy.values ?? []).map((item) => item.trim()).filter(Boolean)),
    );
    if ((policy.type === 'ROLE' || policy.type === 'USER') && values.length === 0) {
      throw new BadRequestException(`${policy.type} 接收策略必须配置接收对象`);
    }
    if (
      (policy.type === 'BUSINESS_OWNER' || policy.type === 'PROJECT_MEMBERS') &&
      values.length > 0
    ) {
      throw new BadRequestException(`${policy.type} 接收策略不接受固定对象列表`);
    }
    return { type: policy.type, values };
  }

  private readChannels(value: Prisma.JsonValue): NotificationChannel[] {
    if (Array.isArray(value)) {
      const parsed = value.flatMap((item) => {
        if (typeof item !== 'string') return [];
        try {
          return [this.normalizeChannel(item)];
        } catch {
          return [];
        }
      });
      return Array.from(new Set(parsed));
    }
    return [];
  }

  private readRecipientPolicy(value: Prisma.JsonValue): {
    type: NotificationRecipientPolicyDto['type'];
    values: string[];
  } {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const rawType = value.type;
      const rawValues = value.values;
      if (
        typeof rawType === 'string' &&
        ['BUSINESS_OWNER', 'PROJECT_MEMBERS', 'ROLE', 'USER'].includes(rawType)
      ) {
        const values = Array.isArray(rawValues)
          ? rawValues.filter((item): item is string => typeof item === 'string')
          : [];
        return {
          type: rawType as NotificationRecipientPolicyDto['type'],
          values,
        };
      }
    }
    throw new BadRequestException('通知规则接收策略数据无效');
  }

  private toTargetRule(rule: {
    id: string;
    name: string;
    eventType: string;
    channels: Prisma.JsonValue;
    recipientPolicy: Prisma.JsonValue;
    templateId: string | null;
    isEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: rule.id,
      name: rule.name,
      eventType: rule.eventType,
      channels: this.readChannels(rule.channels),
      recipientPolicy: this.readRecipientPolicy(rule.recipientPolicy),
      templateId: rule.templateId,
      enabled: rule.isEnabled,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }
}
