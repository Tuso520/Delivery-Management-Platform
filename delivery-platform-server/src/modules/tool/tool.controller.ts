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
  ApiBody,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';

import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { CreateToolCategoryDto } from './dto/create-tool-category.dto';
import { CreateToolItemDto } from './dto/create-tool-item.dto';
import { UpdateToolCategoryDto } from './dto/update-tool-category.dto';
import { UpdateToolItemDto } from './dto/update-tool-item.dto';
import { ToolService } from './tool.service';


@ApiTags('Tools')
@ApiBearerAuth('JWT-auth')
@Controller('tools')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ToolController {
  constructor(private readonly toolService: ToolService) {}

  // ========== Category Endpoints ==========

  @Get('categories')
  @Permissions('tools:view')
  @ApiOperation({ summary: '获取工具分类列表（含工具数量）' })
  @ApiResponse({ status: 200, description: '分类列表' })
  async findAllCategories() {
    return this.toolService.findAllCategories();
  }

  @Post('categories')
  @UseGuards(RolesGuard)
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('tools:create')
  @ApiOperation({ summary: '创建工具分类' })
  @ApiBody({ type: CreateToolCategoryDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createCategory(@Body() dto: CreateToolCategoryDto) {
    return this.toolService.createCategory(dto);
  }

  @Put('categories/:id')
  @UseGuards(RolesGuard)
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('tools:update')
  @ApiOperation({ summary: '更新工具分类' })
  @ApiBody({ type: UpdateToolCategoryDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '分类不存在' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateToolCategoryDto,
  ) {
    return this.toolService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @UseGuards(RolesGuard)
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('tools:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除工具分类' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '分类不存在' })
  async removeCategory(@Param('id') id: string) {
    await this.toolService.deleteCategory(id);
    return null;
  }

  // ========== ToolItem Endpoints ==========

  @Get('items')
  @Permissions('tools:view')
  @ApiOperation({ summary: '获取工具列表（可按分类筛选）' })
  @ApiQuery({ name: 'categoryId', required: false, description: '工具分类ID' })
  @ApiResponse({ status: 200, description: '工具列表' })
  async findAllTools(@Query('categoryId') categoryId?: string) {
    return this.toolService.findAllTools(categoryId);
  }

  @Post('items')
  @UseGuards(RolesGuard)
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('tools:create')
  @ApiOperation({ summary: '创建工具' })
  @ApiBody({ type: CreateToolItemDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createTool(@Body() dto: CreateToolItemDto) {
    return this.toolService.createTool(dto);
  }

  @Get('items/:id')
  @Permissions('tools:view')
  @ApiOperation({ summary: '获取工具详情' })
  @ApiResponse({ status: 200, description: '工具详情' })
  @ApiResponse({ status: 404, description: '工具不存在' })
  async findTool(@Param('id') id: string) {
    return this.toolService.findToolById(id);
  }

  @Put('items/:id')
  @UseGuards(RolesGuard)
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('tools:update')
  @ApiOperation({ summary: '更新工具信息' })
  @ApiBody({ type: UpdateToolItemDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '工具不存在' })
  async updateTool(@Param('id') id: string, @Body() dto: UpdateToolItemDto) {
    return this.toolService.updateTool(id, dto);
  }

  @Delete('items/:id')
  @UseGuards(RolesGuard)
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('tools:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除工具' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '工具不存在' })
  async removeTool(@Param('id') id: string) {
    await this.toolService.deleteTool(id);
    return null;
  }
}
