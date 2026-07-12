import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import { DashboardService } from './dashboard.service';
import {
  DashboardTaskDto,
  HighRiskProjectDto,
  ProjectSummaryDto,
  RecentActivityDto,
  RecentProjectDto,
} from './dto/dashboard-response.dto';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('project-summary')
  @RequirePermissions({ all: ['dashboard:view'] })
  @ApiOperation({ summary: '获取当前数据范围内的项目概览' })
  @ApiResponse({ status: 200, type: ProjectSummaryDto })
  getProjectSummary(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getProjectSummary(user);
  }

  @Get('my-tasks')
  @RequirePermissions({ all: ['dashboard:view'] })
  @ApiOperation({ summary: '获取当前用户的工作台待办' })
  @ApiResponse({ status: 200, type: [DashboardTaskDto] })
  getMyTasks(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getMyTasks(user);
  }

  @Get('high-risks')
  @RequirePermissions({ all: ['dashboard:view'] })
  @ApiOperation({ summary: '获取当前数据范围内的高风险项目' })
  @ApiResponse({ status: 200, type: [HighRiskProjectDto] })
  getHighRisks(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getHighRisks(user);
  }

  @Get('recent-projects')
  @RequirePermissions({ all: ['dashboard:view'] })
  @ApiOperation({ summary: '获取当前数据范围内最近更新的项目' })
  @ApiResponse({ status: 200, type: [RecentProjectDto] })
  getRecentProjects(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getRecentProjects(user);
  }

  @Get('recent-activities')
  @RequirePermissions({ all: ['dashboard:view'] })
  @ApiOperation({ summary: '获取当前数据范围内的近期项目活动' })
  @ApiResponse({ status: 200, type: [RecentActivityDto] })
  getRecentActivities(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getRecentActivities(user);
  }
}
