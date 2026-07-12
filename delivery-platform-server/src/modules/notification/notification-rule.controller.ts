import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import {
  CreateTargetNotificationRuleDto,
  UpdateTargetNotificationRuleDto,
} from './dto/notification.dto';
import { NotificationService } from './notification.service';

@ApiTags('NotificationRules')
@ApiBearerAuth('JWT-auth')
@Controller('notification-rules')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationRuleController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @RequirePermissions({ any: ['notification_rule:view', 'notification_rule:manage'] })
  @ApiOperation({ summary: '获取通知规则' })
  findAll() {
    return this.notificationService.findTargetRules();
  }

  @Post()
  @RequirePermissions({ all: ['notification_rule:manage'] })
  @ApiOperation({ summary: '创建通知规则' })
  create(@Body() dto: CreateTargetNotificationRuleDto) {
    return this.notificationService.createTargetRule(dto);
  }

  @Patch(':id')
  @RequirePermissions({ all: ['notification_rule:manage'] })
  @ApiOperation({ summary: '局部更新通知规则' })
  update(@Param('id') id: string, @Body() dto: UpdateTargetNotificationRuleDto) {
    return this.notificationService.updateTargetRule(id, dto);
  }

  @Delete(':id')
  @RequirePermissions({ all: ['notification_rule:manage'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '软删除通知规则' })
  async remove(@Param('id') id: string) {
    await this.notificationService.deleteTargetRule(id);
    return null;
  }

  @Post(':id/toggle')
  @RequirePermissions({ all: ['notification_rule:manage'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '切换通知规则启用状态' })
  toggle(@Param('id') id: string) {
    return this.notificationService.toggleTargetRule(id);
  }
}
