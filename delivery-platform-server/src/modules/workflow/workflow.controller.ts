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
  ApiQuery,
} from '@nestjs/swagger';

import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import {
  CreateWorkflowCategoryDto,
  UpdateWorkflowCategoryDto,
  CreateWorkflowDocumentDto,
  UpdateWorkflowDocumentDto,
  QueryWorkflowDocumentDto,
} from './dto/workflow.dto';
import { WorkflowService } from './workflow.service';


@ApiTags('Workflow')
@ApiBearerAuth('JWT-auth')
@Controller('workflow')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  // ==================== Category Endpoints ====================

  @Get('categories')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
  @Permissions('workflow:view')
  @ApiOperation({ summary: '获取流程分类列表' })
  @ApiResponse({ status: 200, description: '分类列表（含文档数）' })
  async findAllCategories() {
    return this.workflowService.findAllCategories();
  }

  @Post('categories')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN')
  @Permissions('workflow:create')
  @ApiOperation({ summary: '创建流程分类' })
  @ApiBody({ type: CreateWorkflowCategoryDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createCategory(@Body() dto: CreateWorkflowCategoryDto) {
    return this.workflowService.createCategory(dto);
  }

  @Get('categories/:id')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
  @Permissions('workflow:view')
  @ApiOperation({ summary: '获取流程分类详情（含文档列表）' })
  @ApiResponse({ status: 200, description: '分类详情' })
  @ApiResponse({ status: 404, description: '分类不存在' })
  async findCategoryOne(@Param('id') id: string) {
    return this.workflowService.findCategoryById(id);
  }

  @Put('categories/:id')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN')
  @Permissions('workflow:update')
  @ApiOperation({ summary: '更新流程分类' })
  @ApiBody({ type: UpdateWorkflowCategoryDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '分类不存在' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowCategoryDto,
  ) {
    return this.workflowService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN')
  @Permissions('workflow:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除流程分类' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '分类不存在' })
  @ApiResponse({ status: 400, description: '分类下还有文档，无法删除' })
  async deleteCategory(@Param('id') id: string) {
    await this.workflowService.deleteCategory(id);
    return null;
  }

  // ==================== Document Endpoints ====================

  @Get('documents')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
  @Permissions('workflow:view')
  @ApiOperation({ summary: '获取流程文档列表（分页）' })
  @ApiResponse({ status: 200, description: '文档列表' })
  async findAllDocuments(@Query() query: QueryWorkflowDocumentDto) {
    return this.workflowService.findAllDocuments(query);
  }

  @Post('documents')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN')
  @Permissions('workflow:create')
  @ApiOperation({ summary: '创建流程文档' })
  @ApiBody({ type: CreateWorkflowDocumentDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 404, description: '分类不存在' })
  async createDocument(@Body() dto: CreateWorkflowDocumentDto) {
    return this.workflowService.createDocument(dto);
  }

  @Get('documents/:id')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
  @Permissions('workflow:view')
  @ApiOperation({ summary: '获取流程文档详情' })
  @ApiResponse({ status: 200, description: '文档详情' })
  @ApiResponse({ status: 404, description: '文档不存在' })
  async findDocumentOne(@Param('id') id: string) {
    return this.workflowService.findDocumentById(id);
  }

  @Put('documents/:id')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN')
  @Permissions('workflow:update')
  @ApiOperation({ summary: '更新流程文档' })
  @ApiBody({ type: UpdateWorkflowDocumentDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '文档不存在' })
  async updateDocument(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDocumentDto,
  ) {
    return this.workflowService.updateDocument(id, dto);
  }

  @Delete('documents/:id')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN')
  @Permissions('workflow:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除流程文档' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '文档不存在' })
  async deleteDocument(@Param('id') id: string) {
    await this.workflowService.deleteDocument(id);
    return null;
  }

  @Get('search')
  @Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
  @Permissions('workflow:view')
  @ApiOperation({ summary: '搜索流程文档（关键词）' })
  @ApiQuery({ name: 'keyword', required: true, description: '搜索关键词' })
  @ApiResponse({ status: 200, description: '搜索结果' })
  async search(@Query('keyword') keyword: string) {
    return this.workflowService.search(keyword);
  }
}
