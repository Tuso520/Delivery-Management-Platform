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
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import { ChecklistStatisticsService } from './checklist-statistics.service';
import { ChecklistService } from './checklist.service';
import {
  CreateChecklistTemplateDto,
  UpdateChecklistTemplateDto,
  CreateChecklistTemplateItemDto,
  UpdateChecklistTemplateItemDto,
  ReorderItemsDto,
  UpdateProjectChecklistItemDto,
  ReviewChecklistItemDto,
  GenerateChecklistDto,
  QueryChecklistTemplateDto,
} from './dto/checklist.dto';

@ApiTags('Checklist')
@ApiBearerAuth('JWT-auth')
@Controller('checklist')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ChecklistController {
  constructor(
    private readonly checklistService: ChecklistService,
    private readonly checklistStatisticsService: ChecklistStatisticsService,
  ) {}

  // ==================== Template Endpoints ====================

  @Get('templates')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
  @Permissions('checklist:view')
  @ApiOperation({ summary: '获取检查清单模板列表（分页）' })
  @ApiResponse({ status: 200, description: '模板列表' })
  async findAllTemplates(@Query() query: QueryChecklistTemplateDto) {
    return this.checklistService.findAllTemplates(query);
  }

  @Post('templates')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
  @Permissions('checklist:create')
  @ApiOperation({ summary: '创建检查清单模板' })
  @ApiBody({ type: CreateChecklistTemplateDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 409, description: '模板编码已存在' })
  async createTemplate(@Body() dto: CreateChecklistTemplateDto) {
    return this.checklistService.createTemplate(dto);
  }

  @Get('templates/:id')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
  @Permissions('checklist:view')
  @ApiOperation({ summary: '获取检查清单模板详情（含检查项列表）' })
  @ApiResponse({ status: 200, description: '模板详情' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  async findTemplateOne(@Param('id') id: string) {
    return this.checklistService.findTemplateById(id);
  }

  @Put('templates/:id')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
  @Permissions('checklist:update')
  @ApiOperation({ summary: '更新检查清单模板' })
  @ApiBody({ type: UpdateChecklistTemplateDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateChecklistTemplateDto,
  ) {
    return this.checklistService.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
  @Permissions('checklist:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除检查清单模板' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  @ApiResponse({ status: 400, description: '模板已被使用，无法删除' })
  async deleteTemplate(@Param('id') id: string) {
    await this.checklistService.deleteTemplate(id);
    return null;
  }

  // ==================== Template Item Endpoints ====================

  @Post('templates/:id/items')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
  @Permissions('checklist:update')
  @ApiOperation({ summary: '添加检查清单模板项' })
  @ApiBody({ type: CreateChecklistTemplateItemDto })
  @ApiResponse({ status: 201, description: '添加成功' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  async addItem(
    @Param('id') id: string,
    @Body() dto: CreateChecklistTemplateItemDto,
  ) {
    return this.checklistService.addItem(id, dto);
  }

  @Put('items/:itemId')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
  @Permissions('checklist:update')
  @ApiOperation({ summary: '更新检查清单模板项' })
  @ApiBody({ type: UpdateChecklistTemplateItemDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '检查项不存在' })
  async updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateChecklistTemplateItemDto,
  ) {
    return this.checklistService.updateItem(itemId, dto);
  }

  @Delete('items/:itemId')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
  @Permissions('checklist:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除检查清单模板项' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '检查项不存在' })
  async deleteItem(@Param('itemId') itemId: string) {
    await this.checklistService.deleteTemplateItem(itemId);
    return null;
  }

  @Post('templates/:id/reorder')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
  @Permissions('checklist:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重新排序模板检查项' })
  @ApiBody({ type: ReorderItemsDto })
  @ApiResponse({ status: 200, description: '排序成功' })
  async reorderItems(
    @Param('id') id: string,
    @Body() dto: ReorderItemsDto,
  ) {
    return this.checklistService.reorderItems(id, dto);
  }

  // ==================== Project Checklist Endpoints ====================

  @Get('projects/:projectId/checklist')
  @Permissions('project:view')
  @ApiOperation({ summary: '获取项目检查清单列表' })
  @ApiResponse({ status: 200, description: '项目检查清单' })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async findByProject(
    @Param('projectId') projectId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.checklistService.findByProject(projectId, userId);
  }

  @Post('projects/:projectId/checklist/generate')
  @Permissions('project:update')
  @ApiOperation({ summary: '从模板生成项目检查清单' })
  @ApiBody({ type: GenerateChecklistDto })
  @ApiResponse({ status: 201, description: '生成成功' })
  @ApiResponse({ status: 409, description: '已生成过' })
  async generate(
    @Param('projectId') projectId: string,
    @Body() dto: GenerateChecklistDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.checklistService.generate(projectId, dto.templateId, userId);
  }

  @Put('checklist-items/:itemId')
  @Permissions('checklist:update')
  @ApiOperation({ summary: '更新项目检查项' })
  @ApiBody({ type: UpdateProjectChecklistItemDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '检查项不存在' })
  async updateProjectItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateProjectChecklistItemDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.checklistService.updateProjectItem(itemId, dto, userId);
  }

  @Post('checklist-items/:itemId/submit')
  @Permissions('checklist:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提交项目检查项审核' })
  @ApiResponse({ status: 200, description: '提交成功' })
  @ApiResponse({ status: 400, description: '当前状态不可提交' })
  async submitItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.checklistService.submitItem(itemId, user.sub);
  }

  @Post('checklist-items/:itemId/review')
  @Permissions('checklist:review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '审核项目检查项' })
  @ApiBody({ type: ReviewChecklistItemDto })
  @ApiResponse({ status: 200, description: '审核成功' })
  @ApiResponse({ status: 400, description: '当前状态不可审核' })
  async reviewItem(
    @Param('itemId') itemId: string,
    @Body() dto: ReviewChecklistItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.checklistService.reviewItem(itemId, dto, user.sub);
  }

  @Get('projects/:projectId/checklist/statistics')
  @Permissions('project:view')
  @ApiOperation({ summary: '获取项目检查清单完成率统计' })
  @ApiResponse({ status: 200, description: '统计信息' })
  async getStatistics(
    @Param('projectId') projectId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.checklistStatisticsService.getCompletionRate(projectId, userId);
  }
}
