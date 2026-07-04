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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { CreateProjectDto } from './dto/create-project.dto';
import { QueryProjectDto } from './dto/query-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectService } from './project.service';


@ApiTags('Projects')
@ApiBearerAuth('JWT-auth')
@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('DELIVERY_MANAGER', 'COUNTRY_MANAGER', 'PROJECT_MANAGER')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  @Permissions('project:view')
  @ApiOperation({ summary: '获取项目列表（分页+搜索+筛选）' })
  @ApiResponse({
    status: 200,
    description: '项目列表',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          list: [
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
              contractAmount: 100000.00,
              projectLanguage: 'zh-CN',
              currentStage: 'Initiation',
              projectStatus: 'Draft',
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
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async findAll(
    @Query() query: QueryProjectDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectService.findAll(query, userId);
  }

  @Post()
  @Permissions('project:create')
  @ApiOperation({ summary: '创建项目' })
  @ApiBody({ type: CreateProjectDto })
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
          projectStatus: 'Draft',
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async create(
    @Body() dto: CreateProjectDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectService.create(dto, userId);
  }

  @Get(':id')
  @Permissions('project:view')
  @ApiOperation({ summary: '获取项目详情' })
  @ApiResponse({ status: 200, description: '项目详情' })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async findOne(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.projectService.findById(id, userId);
  }

  @Put(':id')
  @Permissions('project:update')
  @ApiOperation({ summary: '更新项目信息' })
  @ApiBody({ type: UpdateProjectDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectService.update(id, dto, userId);
  }

  @Delete(':id')
  @Permissions('project:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除项目（软删除）' })
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
  async remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    await this.projectService.softDelete(id, userId);
    return null;
  }
}
