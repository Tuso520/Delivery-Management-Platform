import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import { ArchiveTemplateService } from './archive-template.service';
import { CreateArchiveTemplateDto, QueryArchiveTemplateDto } from './dto/archive-template.dto';

const ARCHIVE_TEMPLATE_REFERENCE_PERMISSIONS = [
  'project:view',
  'project:create',
  'project:update',
  'archive_template:view',
] as const;

@ApiTags('Archive Templates')
@ApiBearerAuth('JWT-auth')
@Controller('archive-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ArchiveTemplateController {
  constructor(private readonly archiveTemplateService: ArchiveTemplateService) {}

  @Get()
  @RequirePermissions({ any: [...ARCHIVE_TEMPLATE_REFERENCE_PERMISSIONS] })
  @ApiOperation({ summary: '获取档案模板列表' })
  @ApiResponse({ status: 200, description: '模板列表' })
  findAll(@Query() query: QueryArchiveTemplateDto) {
    return this.archiveTemplateService.findAll(query);
  }

  @Post()
  @RequirePermissions({ all: ['archive_template:create'] })
  @ApiOperation({ summary: '创建档案模板及其初始草稿版本' })
  @ApiBody({ type: CreateArchiveTemplateDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 409, description: '模板编码已存在' })
  create(@Body() dto: CreateArchiveTemplateDto, @CurrentUser('sub') userId: string) {
    return this.archiveTemplateService.create(dto, userId);
  }

  @Get(':id')
  @RequirePermissions({ all: ['archive_template:view'] })
  @ApiOperation({ summary: '获取档案模板及版本快照' })
  @ApiResponse({ status: 200, description: '模板详情' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  findOne(@Param('id') id: string) {
    return this.archiveTemplateService.findById(id);
  }

  @Delete(':id')
  @RequirePermissions({ all: ['archive_template:delete'] })
  @ApiOperation({ summary: '删除未被项目引用的档案模板（仅超级管理员）' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 403, description: '仅超级管理员可删除' })
  @ApiResponse({ status: 409, description: '模板已被项目或项目档案引用' })
  async remove(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    await this.archiveTemplateService.remove(id, actor);
    return null;
  }
}
