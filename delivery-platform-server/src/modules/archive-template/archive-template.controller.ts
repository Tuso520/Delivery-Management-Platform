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

import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { ArchiveTemplateService } from './archive-template.service';
import {
  CreateArchiveTemplateDto,
  CreateArchiveTemplateItemDto,
  UpdateArchiveTemplateDto,
  UpdateArchiveTemplateItemDto,
  QueryArchiveTemplateDto,
} from './dto/archive-template.dto';


@ApiTags('Archive Templates')
@ApiBearerAuth('JWT-auth')
@Controller('archive-templates')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
export class ArchiveTemplateController {
  constructor(private readonly archiveTemplateService: ArchiveTemplateService) {}

  @Get()
  @Permissions('archive_template:view')
  @ApiOperation({ summary: '获取档案模板列表' })
  @ApiResponse({ status: 200, description: '模板列表' })
  async findAll(@Query() query: QueryArchiveTemplateDto) {
    return this.archiveTemplateService.findAll(query);
  }

  @Post()
  @Permissions('archive_template:create')
  @ApiOperation({ summary: '创建档案模板' })
  @ApiBody({ type: CreateArchiveTemplateDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 409, description: '模板编码已存在' })
  async create(@Body() dto: CreateArchiveTemplateDto) {
    return this.archiveTemplateService.create(dto);
  }

  @Get(':id')
  @Permissions('archive_template:view')
  @ApiOperation({ summary: '获取档案模板详情（含目录项）' })
  @ApiResponse({ status: 200, description: '模板详情' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  async findOne(@Param('id') id: string) {
    return this.archiveTemplateService.findById(id);
  }

  @Put(':id')
  @Permissions('archive_template:update')
  @ApiOperation({ summary: '更新档案模板' })
  @ApiBody({ type: UpdateArchiveTemplateDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  async update(@Param('id') id: string, @Body() dto: UpdateArchiveTemplateDto) {
    return this.archiveTemplateService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('archive_template:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除档案模板' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  async remove(@Param('id') id: string) {
    await this.archiveTemplateService.delete(id);
    return null;
  }

  @Get(':id/items')
  @Permissions('archive_template:view')
  @ApiOperation({ summary: '获取模板目录项列表' })
  @ApiResponse({ status: 200, description: '目录项列表' })
  async findItems(
    @Param('id') id: string,
    @Query('tree') tree?: string,
  ) {
    const buildTree = tree === 'true';
    return this.archiveTemplateService.findItems(id, buildTree);
  }

  @Post(':id/items')
  @Permissions('archive_template:update')
  @ApiOperation({ summary: '新增档案模板目录项' })
  createItem(
    @Param('id') id: string,
    @Body() dto: CreateArchiveTemplateItemDto,
  ) {
    return this.archiveTemplateService.createItem(id, dto);
  }

  @Put('items/:itemId')
  @Permissions('archive_template:update')
  @ApiOperation({ summary: '更新档案模板目录项' })
  updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateArchiveTemplateItemDto,
  ) {
    return this.archiveTemplateService.updateItem(itemId, dto);
  }

  @Delete('items/:itemId')
  @Permissions('archive_template:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除未被项目使用的档案模板目录项' })
  async deleteItem(@Param('itemId') itemId: string): Promise<null> {
    await this.archiveTemplateService.deleteItem(itemId);
    return null;
  }
}
