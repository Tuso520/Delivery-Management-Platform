import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
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

import { GenerateArchiveDto, UpdateArchiveItemDto } from './dto/project-archive.dto';
import { ProjectArchiveService } from './project-archive.service';


@ApiTags('Project Archives')
@ApiBearerAuth('JWT-auth')
@Controller('projects/:projectId/archives')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('DELIVERY_MANAGER', 'COUNTRY_MANAGER', 'PROJECT_MANAGER')
export class ProjectArchiveController {
  constructor(private readonly projectArchiveService: ProjectArchiveService) {}

  @Get()
  @Permissions('archive:view')
  @ApiOperation({ summary: '获取项目档案目录（按阶段分组）' })
  @ApiResponse({ status: 200, description: '档案目录' })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async findByProject(
    @Param('projectId') projectId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectArchiveService.findByProject(projectId, userId);
  }

  @Post('generate')
  @Permissions('archive:generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成项目档案目录（从模板拷贝）' })
  @ApiBody({ type: GenerateArchiveDto })
  @ApiResponse({ status: 200, description: '生成成功' })
  @ApiResponse({ status: 400, description: '项目已有档案或模板为空' })
  @ApiResponse({ status: 404, description: '项目或模板不存在' })
  async generateArchive(
    @Param('projectId') projectId: string,
    @Body() dto: GenerateArchiveDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectArchiveService.generateArchive(projectId, dto, userId);
  }

  @Get('statistics')
  @Permissions('archive:view')
  @ApiOperation({ summary: '获取档案完成度统计' })
  @ApiResponse({ status: 200, description: '统计信息' })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async getStatistics(
    @Param('projectId') projectId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectArchiveService.getStatistics(projectId, userId);
  }

  @Get(':itemId')
  @Permissions('archive:view')
  @ApiOperation({ summary: '获取档案项详情（含文件列表）' })
  @ApiResponse({ status: 200, description: '档案项详情' })
  @ApiResponse({ status: 404, description: '档案项不存在' })
  async findOne(
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectArchiveService.findById(itemId, projectId, userId);
  }

  @Put(':itemId')
  @Permissions('archive:update')
  @ApiOperation({ summary: '更新档案项（负责人/审核人/状态）' })
  @ApiBody({ type: UpdateArchiveItemDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '档案项不存在' })
  async updateItem(
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateArchiveItemDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectArchiveService.updateItem(
      itemId,
      projectId,
      dto,
      userId,
    );
  }

  @Post(':itemId/mark-not-applicable')
  @Permissions('archive:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '标记档案项为"不适用"' })
  @ApiResponse({ status: 200, description: '标记成功' })
  @ApiResponse({ status: 404, description: '档案项不存在' })
  async markNotApplicable(
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectArchiveService.markNotApplicable(
      itemId,
      projectId,
      userId,
    );
  }
}
