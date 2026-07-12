import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { QueryNotificationDto } from './dto/notification.dto';
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
          items: [
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
          page: 1,
          pageSize: 20,
          total: 1,
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
  async markAsRead(@Param('id') id: string, @CurrentUser('sub') userId: string) {
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
}
