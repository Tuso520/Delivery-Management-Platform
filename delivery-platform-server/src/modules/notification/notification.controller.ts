import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

import {
  QueryNotificationDto,
  CreateNotificationDto,
  CreateNotificationRuleDto,
  UpdateNotificationRuleDto,
} from './dto/notification.dto';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: '获取用户通知列表（分页+筛选）' })
  @ApiResponse({
    status: 200,
    description: '通知列表',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          list: [
            {
              id: 'uuid',
              title: '审核通知',
              content: '您有一条资料待审核',
              notificationType: 'review',
              relatedType: 'archive_item',
              relatedId: 'uuid',
              isRead: false,
              createdAt: '2026-06-22T10:00:00.000Z',
              readAt: null,
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async findAll(@CurrentUser('sub') userId: string, @Query() query: QueryNotificationDto) {
    return this.notificationService.findByUser(userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: '获取未读通知数量' })
  @ApiResponse({
    status: 200,
    description: '未读通知数量',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: { count: 5 },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async getUnreadCount(@CurrentUser('sub') userId: string) {
    return this.notificationService.getUnreadCount(userId);
  }

  @Post()
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN')
  @Permissions('notification:create')
  @ApiOperation({ summary: '创建通知（仅超级管理员和系统管理员）' })
  @ApiBody({ type: CreateNotificationDto })
  @ApiResponse({
    status: 201,
    description: '创建成功',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          id: 'uuid',
          title: '审核通知',
          content: '您有一条资料待审核',
          notificationType: 'review',
          relatedType: 'archive_item',
          relatedId: 'uuid',
          isRead: false,
          createdAt: '2026-06-22T10:00:00.000Z',
          readAt: null,
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async create(@Body() dto: CreateNotificationDto, @CurrentUser() user: JwtPayload) {
    return this.notificationService.create(dto, user);
  }

  @Put(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '标记单条通知为已读' })
  @ApiResponse({
    status: 200,
    description: '标记成功',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          id: 'uuid',
          title: '审核通知',
          content: '您有一条资料待审核',
          notificationType: 'review',
          isRead: true,
          readAt: '2026-06-22T10:30:00.000Z',
        },
        timestamp: '2026-06-22T10:30:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: '通知不存在' })
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.notificationService.markAsRead(id, userId);
  }

  @Put('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '标记全部通知为已读' })
  @ApiResponse({
    status: 200,
    description: '全部标记已读',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: { count: 5 },
        timestamp: '2026-06-22T10:30:00.000Z',
      },
    },
  })
  async markAllAsRead(@CurrentUser('sub') userId: string) {
    return this.notificationService.markAllAsRead(userId);
  }

  // Notification Rules

  @Get('rules')
  @Permissions('notification:view')
  @ApiOperation({ summary: '获取通知规则列表' })
  @ApiResponse({
    status: 200,
    description: '通知规则列表',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: [
          {
            id: 'uuid',
            name: '资料审核通知',
            eventType: 'archive_review',
            channel: 'in_app',
            recipientRole: 'PROJECT_MANAGER',
            template: '您有一条资料待审核',
            isEnabled: true,
            createdAt: '2026-06-22T10:00:00.000Z',
          },
        ],
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async findAllRules() {
    return this.notificationService.findAllRules();
  }

  @Post('rules')
  @Permissions('notification:manage_rules')
  @ApiOperation({ summary: '创建通知规则' })
  @ApiBody({ type: CreateNotificationRuleDto })
  @ApiResponse({
    status: 201,
    description: '创建成功',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          id: 'uuid',
          name: '资料审核通知',
          eventType: 'archive_review',
          channel: 'in_app',
          recipientRole: 'PROJECT_MANAGER',
          template: '您有一条资料待审核',
          isEnabled: true,
          createdAt: '2026-06-22T10:00:00.000Z',
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async createRule(@Body() dto: CreateNotificationRuleDto) {
    return this.notificationService.createRule(dto);
  }

  @Put('rules/:id')
  @Permissions('notification:manage_rules')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新通知规则' })
  @ApiBody({ type: UpdateNotificationRuleDto })
  @ApiResponse({
    status: 200,
    description: '更新成功',
  })
  @ApiResponse({ status: 404, description: '规则不存在' })
  async updateRule(@Param('id') id: string, @Body() dto: UpdateNotificationRuleDto) {
    return this.notificationService.updateRule(id, dto);
  }

  @Delete('rules/:id')
  @Permissions('notification:manage_rules')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除通知规则' })
  @ApiResponse({
    status: 200,
    description: '删除成功',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: null,
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: '规则不存在' })
  async deleteRule(@Param('id') id: string) {
    await this.notificationService.deleteRule(id);
    return null;
  }
}
