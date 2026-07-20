import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectStatusActionDto } from './dto/project-status-action.dto';
import { QueryProjectDto } from './dto/query-project.dto';
import { UpdateProjectProgressDto } from './dto/update-project-progress.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectConfigurationService } from './project-configuration.service';
import { validateProjectCreateIdempotencyKey } from './project-create-idempotency';
import { ProjectService, type ProjectReadAuditContext } from './project.service';

function getReadAuditContext(request: Request): ProjectReadAuditContext {
  return {
    ipAddress: request.ip,
    userAgent: request.get('user-agent'),
  };
}

@ApiTags('Projects')
@ApiBearerAuth('JWT-auth')
@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly projectConfiguration: ProjectConfigurationService,
  ) {}

  @Get()
  @RequirePermissions({ all: ['project:view'] })
  @ApiOperation({ summary: '获取项目列表（分页+搜索+筛选）' })
  @ApiResponse({
    status: 200,
    description: '项目列表',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          items: [
            {
              id: 'uuid',
              projectCode: 'VN-AC-2026-001',
              projectName: '某网络建设项目',
              countryCode: 'VN',
              city: '河内',
              customerName: '测试客户',
              projectType: 'Network',
              contractCurrency: 'USD',
              baseCurrency: 'CNY',
              contractAmount: 100000.0,
              projectLanguage: 'zh-CN',
              currentStage: 'STARTUP',
              status: 'DRAFT',
              riskLevel: 'Low',
              startDate: '2026-07-01T00:00:00.000Z',
              plannedEndDate: '2026-12-31T00:00:00.000Z',
              actualEndDate: null,
              createdBy: null,
              createdAt: '2026-06-22T10:00:00.000Z',
              updatedAt: '2026-06-22T10:00:00.000Z',
              members: [],
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
  async findAll(
    @Query() query: QueryProjectDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.projectService.findAll(query, user, getReadAuditContext(request));
  }

  @Get('summary')
  @RequirePermissions({ all: ['project:view'] })
  @ApiOperation({ summary: '获取当前数据范围内的项目概览统计' })
  getSummary(@Query() query: QueryProjectDto, @CurrentUser() user: JwtPayload) {
    return this.projectService.getSummary(user, query.scope);
  }

  @Get('configuration')
  @RequirePermissions({
    any: ['project:view', 'project:create', 'archive_template:view', 'archive_template:create'],
  })
  @ApiOperation({ summary: '获取项目表单的当前启用配置项' })
  getConfiguration(@Query('includeInactive') includeInactive?: string) {
    return this.projectConfiguration.getConfiguration(includeInactive === 'true');
  }

  @Get('archived')
  @RequirePermissions({ all: ['project:view'] })
  @ApiOperation({ summary: '获取当前数据范围内的归档项目列表' })
  findArchived(@Query() query: QueryProjectDto, @CurrentUser() user: JwtPayload) {
    return this.projectService.findArchived(query, user);
  }

  @Post()
  @RequirePermissions({ all: ['project:create'] })
  @ApiOperation({ summary: '创建项目' })
  @ApiBody({ type: CreateProjectDto })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: '8-100 位安全字符；仅在重试完全相同的项目创建请求时复用',
  })
  @ApiResponse({
    status: 201,
    description: '创建成功',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          id: 'uuid',
          projectCode: 'VN-AC-2026-001',
          projectName: '某网络建设项目',
          countryCode: 'VN',
          status: 'DRAFT',
          currentStage: 'STARTUP',
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.projectService.create(
      dto,
      user,
      validateProjectCreateIdempotencyKey(idempotencyKey),
    );
  }

  @Get(':id')
  @RequirePermissions({ all: ['project:view'] })
  @ApiOperation({ summary: '获取项目详情' })
  @ApiResponse({ status: 200, description: '项目详情' })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() request: Request) {
    return this.projectService.findById(id, user, getReadAuditContext(request));
  }

  @Patch(':id')
  @RequirePermissions({ all: ['project:update'] })
  @ApiOperation({ summary: '更新项目普通可编辑字段' })
  patch(@Param('id') id: string, @Body() dto: UpdateProjectDto, @CurrentUser() user: JwtPayload) {
    return this.projectService.update(id, dto, user);
  }

  @Patch(':id/progress')
  @RequirePermissions({ all: ['project:progress:update'] })
  @ApiOperation({ summary: '统一修改项目阶段、进度与验收时间' })
  updateProgress(
    @Param('id') id: string,
    @Body() dto: UpdateProjectProgressDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectService.updateProgress(id, dto, user);
  }

  @Post(':id/pause')
  @RequirePermissions({ all: ['project:update'] })
  pause(
    @Param('id') id: string,
    @Body() dto: ProjectStatusActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectService.changeStatus(id, 'pause', dto, user);
  }

  @Post(':id/resume')
  @RequirePermissions({ all: ['project:update'] })
  resume(
    @Param('id') id: string,
    @Body() dto: ProjectStatusActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectService.changeStatus(id, 'resume', dto, user);
  }

  @Post(':id/complete')
  @RequirePermissions({ all: ['project:update'] })
  complete(
    @Param('id') id: string,
    @Body() dto: ProjectStatusActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectService.changeStatus(id, 'complete', dto, user);
  }

  @Post(':id/cancel')
  @RequirePermissions({ all: ['project:update'] })
  cancel(
    @Param('id') id: string,
    @Body() dto: ProjectStatusActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectService.changeStatus(id, 'cancel', dto, user);
  }

  @Post(':id/archive')
  @RequirePermissions({ all: ['project:view'] })
  archive(
    @Param('id') id: string,
    @Body() dto: ProjectStatusActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectService.changeStatus(id, 'archive', dto, user);
  }

  @Post(':id/restore')
  @RequirePermissions({ all: ['project:restore'] })
  restore(
    @Param('id') id: string,
    @Body() dto: ProjectStatusActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectService.changeStatus(id, 'restore', dto, user);
  }

  @Delete(':id/permanent')
  @RequirePermissions({ all: ['project:delete'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '物理删除无关联记录的项目（仅超级管理员）' })
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
  @ApiResponse({ status: 404, description: '项目不存在' })
  @ApiResponse({ status: 409, description: '项目存在文件、审核、财务或审计记录' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.projectService.purge(id, user);
    return null;
  }
}
