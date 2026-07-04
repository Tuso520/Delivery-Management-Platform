import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import { ApprovalService } from './approval.service';
import {
  CreateApprovalTaskDto,
  DecideApprovalTaskDto,
  QueryPlatformDto,
  UpsertApprovalTemplateDto,
} from './dto/platform.dto';

@ApiTags('Approvals')
@ApiBearerAuth('JWT-auth')
@Controller('approvals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Get('templates')
  @Permissions('approval:view')
  @ApiOperation({ summary: '分页查询审批模板' })
  findTemplates(@Query() query: QueryPlatformDto) {
    return this.approvalService.findTemplates(query);
  }

  @Post('templates')
  @Permissions('approval:manage')
  @ApiOperation({ summary: '创建或更新审批模板及步骤' })
  upsertTemplate(
    @Body() dto: UpsertApprovalTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalService.upsertTemplate(dto, user.sub);
  }

  @Get('tasks')
  @Permissions('approval:view')
  @ApiOperation({ summary: '查询本人相关或可管理的审批任务' })
  findTasks(
    @Query() query: QueryPlatformDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalService.findTasks(query, user.sub);
  }

  @Post('tasks')
  @Permissions('approval:view')
  @ApiOperation({ summary: '发起审批任务' })
  createTask(
    @Body() dto: CreateApprovalTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalService.createTask(dto, user.sub);
  }

  @Post('tasks/:id/decision')
  @Permissions('approval:view')
  @ApiOperation({ summary: '通过或驳回审批任务' })
  decide(
    @Param('id') id: string,
    @Body() dto: DecideApprovalTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalService.decideTask(id, dto, user.sub);
  }
}
