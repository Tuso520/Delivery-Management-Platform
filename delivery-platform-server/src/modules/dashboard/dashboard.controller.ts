import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @Permissions('dashboard:view')
  @ApiOperation({ summary: '获取项目概览统计数据' })
  @ApiResponse({
    status: 200,
    description: '概览统计数据',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          totalProjects: 25,
          activeProjects: 18,
          highRiskProjects: 3,
          delayedProjects: 2,
          pendingReviews: 7,
          avgCompletionRate: 65,
          byStatus: [
            { status: 'Draft', count: 5 },
            { status: 'Active', count: 10 },
            { status: 'Suspended', count: 2 },
            { status: 'Delayed', count: 2 },
            { status: 'Accepted', count: 3 },
            { status: 'Archived', count: 2 },
            { status: 'Closed', count: 1 },
          ],
          byCountry: [
            { countryCode: 'VN', count: 5 },
            { countryCode: 'TH', count: 4 },
            { countryCode: 'SG', count: 3 },
          ],
          acceptedProjects: 3,
          draftProjects: 5,
          totalContractAmount: 4500000,
          totalReceivedAmount: 0,
          recentProjects: [
            {
              id: 'uuid-1',
              projectCode: 'VN-LG-2026-001',
              projectName: '越南LG冷站节能项目',
              countryCode: 'VN',
              status: 'Active',
              riskLevel: 'Medium',
              createdAt: '2026-06-22T10:00:00.000Z',
            },
          ],
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async getOverview(@CurrentUser('sub') userId: string) {
    return this.dashboardService.getOverview(userId);
  }

  @Get('country/:countryCode')
  @Permissions('dashboard:view')
  @ApiOperation({ summary: '获取国家级别统计数据' })
  @ApiResponse({
    status: 200,
    description: '国家统计数据',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          countryCode: 'VN',
          totalProjects: 10,
          activeProjects: 8,
          completionRate: 60,
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async getCountryStats(
    @Param('countryCode') countryCode: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.dashboardService.getCountryStats(countryCode, userId);
  }

  @Get('project/:projectId')
  @Permissions('dashboard:view')
  @ApiOperation({ summary: '获取项目级别详细统计数据' })
  @ApiResponse({
    status: 200,
    description: '项目详细统计数据',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          projectId: 'uuid',
          projectName: '某项目',
          projectCode: 'PRJ-2026-001',
          status: 'Active',
          riskLevel: 'Medium',
          totalArchiveItems: 30,
          completedArchiveItems: 20,
          pendingUploadItems: 5,
          reviewingItems: 3,
          rejectedItems: 2,
          totalChecklistItems: 15,
          completedChecklistItems: 10,
          pendingChecklistItems: 3,
          totalFiles: 45,
          memberCount: 8,
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async getProjectStats(
    @Param('projectId') projectId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.dashboardService.getProjectStats(projectId, userId);
  }

  @Get('my-todos')
  @Permissions('todo:view')
  @ApiOperation({ summary: '获取当前用户待办事项' })
  @ApiResponse({
    status: 200,
    description: '待办事项列表',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: [
          {
            type: 'pending_upload',
            id: 'uuid',
            projectId: 'uuid',
            projectName: '某项目',
            itemName: '合同文件',
            stageCode: 'Initiation',
            status: 'PendingUpload',
            createdAt: '2026-06-22T08:00:00.000Z',
          },
        ],
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async getMyTodos(@CurrentUser('sub') userId: string) {
    return this.dashboardService.getMyTodos(userId);
  }

  @Get('my-projects')
  @Permissions('dashboard:view')
  @ApiOperation({ summary: '获取当前用户参与的项目列表' })
  @ApiResponse({
    status: 200,
    description: '用户参与的项目列表',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: [
          {
            id: 'uuid',
            projectCode: 'PRJ-2026-001',
            projectName: '某项目',
            countryCode: 'VN',
            projectStatus: 'Active',
            riskLevel: 'Low',
            currentStage: 'Initiation',
            role: 'ProjectManager',
          },
        ],
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async getMyProjects(@CurrentUser('sub') userId: string) {
    return this.dashboardService.getMyProjects(userId);
  }
}
