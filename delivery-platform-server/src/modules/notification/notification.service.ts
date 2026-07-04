import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import {
  QueryNotificationDto,
  CreateNotificationDto,
  CreateNotificationRuleDto,
  UpdateNotificationRuleDto,
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

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(userId: string, query: QueryNotificationDto): Promise<PaginatedResult<NotificationItem>> {
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
      list,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async create(dto: CreateNotificationDto, currentUser: JwtPayload): Promise<NotificationItem> {
    // Non-admin users can only create notifications for themselves
    const isAdmin = currentUser.roles?.some(
      (r) => r === 'SUPER_ADMIN' || r === 'SYSTEM_ADMIN',
    );
    if (!isAdmin && dto.userId !== currentUser.sub) {
      throw new ForbiddenException('无权为其他用户创建通知');
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        title: dto.title,
        content: dto.content,
        notificationType: dto.notificationType,
        relatedType: dto.relatedType ?? null,
        relatedId: dto.relatedId ?? null,
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

    return notification;
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

  async resolveInAppNotification(
    input: NotificationEventInput,
  ): Promise<{ title: string; content: string } | null> {
    const rule = await this.prisma.notificationRule.findFirst({
      where: { eventType: input.eventType, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    if (!rule) {
      return { title: input.title, content: input.content };
    }
    if (!rule.isEnabled || rule.channel !== 'in_app') {
      return null;
    }
    if (rule.recipientRole) {
      const matchesRole = await this.prisma.userRole.count({
        where: {
          userId: input.userId,
          role: { roleCode: rule.recipientRole },
        },
      });
      if (matchesRole === 0) {
        return null;
      }
    }
    const variables = {
      title: input.title,
      content: input.content,
      ...(input.variables ?? {}),
    };
    return {
      title: input.title,
      content: this.renderTemplate(rule.template || '{{content}}', variables),
    };
  }

  // Notification Rule CRUD

  async findAllRules() {
    return this.prisma.notificationRule.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRule(dto: CreateNotificationRuleDto) {
    return this.prisma.notificationRule.create({
      data: {
        name: dto.name,
        eventType: dto.eventType,
        channel: dto.channel ?? 'in_app',
        recipientRole: dto.recipientRole ?? null,
        template: dto.template ?? null,
        isEnabled: dto.isEnabled ?? true,
      },
    });
  }

  async updateRule(id: string, dto: UpdateNotificationRuleDto) {
    const rule = await this.prisma.notificationRule.findUnique({
      where: { id },
    });

    if (!rule || rule.deletedAt) {
      throw new NotFoundException('通知规则不存在');
    }

    return this.prisma.notificationRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.eventType !== undefined && { eventType: dto.eventType }),
        ...(dto.channel !== undefined && { channel: dto.channel }),
        ...(dto.recipientRole !== undefined && { recipientRole: dto.recipientRole }),
        ...(dto.template !== undefined && { template: dto.template }),
        ...(dto.isEnabled !== undefined && { isEnabled: dto.isEnabled }),
      },
    });
  }

  async deleteRule(id: string): Promise<void> {
    const rule = await this.prisma.notificationRule.findUnique({
      where: { id },
    });

    if (!rule) {
      throw new NotFoundException('通知规则不存在');
    }

    await this.prisma.notificationRule.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isEnabled: false,
      },
    });
  }

  private renderTemplate(
    template: string,
    variables: Record<string, string>,
  ): string {
    return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key: string) =>
      variables[key] ?? match,
    );
  }
}
