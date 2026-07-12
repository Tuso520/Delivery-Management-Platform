import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import {
  ApproveReviewTaskDto,
  QueryReviewTaskDto,
  RejectReviewTaskDto,
} from './dto/review-task.dto';
import { ReviewTaskService } from './review-task.service';

@ApiTags('Unified File Reviews')
@ApiBearerAuth('JWT-auth')
@Controller('file-reviews')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReviewTaskController {
  constructor(private readonly reviewTasks: ReviewTaskService) {}

  @Get('summary')
  @ApiOperation({ summary: '查询当前用户可见的文件审核统计' })
  getSummary(@CurrentUser() actor: JwtPayload) {
    return this.reviewTasks.getSummary(actor);
  }

  @Get()
  @ApiOperation({ summary: '分页查询当前用户可见的统一审核任务' })
  @ApiPaginatedResponse('统一审核任务分页结果')
  findAll(@Query() query: QueryReviewTaskDto, @CurrentUser() actor: JwtPayload) {
    return this.reviewTasks.findAll(query, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: '查询统一审核任务详情' })
  findById(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.reviewTasks.findById(id, actor);
  }

  @Post(':id/approve')
  @RequirePermissions({ all: ['file_review:act'] })
  @ApiOperation({ summary: '处理当前指派步骤并审核通过' })
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveReviewTaskDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.reviewTasks.approve(id, dto.comment, actor);
  }

  @Post(':id/reject')
  @RequirePermissions({ all: ['file_review:act'] })
  @ApiOperation({ summary: '处理当前指派步骤并驳回' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectReviewTaskDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.reviewTasks.reject(id, dto.comment, actor);
  }

  @Get(':id/history')
  @ApiOperation({ summary: '查询统一审核任务不可变操作历史' })
  getHistory(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.reviewTasks.getHistory(id, actor);
  }
}
