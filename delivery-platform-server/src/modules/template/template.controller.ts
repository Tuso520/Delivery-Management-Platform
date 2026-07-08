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
} from '@nestjs/swagger';

import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import { CreateTemplateVersionDto } from './dto/create-template-version.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { QueryTemplateDto } from './dto/query-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplateService } from './template.service';


@ApiTags('Templates')
@ApiBearerAuth('JWT-auth')
@Controller('templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get()
  @Permissions('template:view')
  @ApiOperation({ summary: '获取模板列表（分页+筛选）' })
  @ApiResponse({ status: 200, description: '模板列表' })
  async findAll(@Query() query: QueryTemplateDto) {
    return this.templateService.findAll(query);
  }

  @Post()
  @Permissions('template:create')
  @ApiOperation({ summary: '创建模板' })
  @ApiBody({ type: CreateTemplateDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  async create(
    @Body() dto: CreateTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.templateService.create(dto, user.sub);
  }

  @Get(':id')
  @Permissions('template:view')
  @ApiOperation({ summary: '获取模板详情（含版本历史）' })
  @ApiResponse({ status: 200, description: '模板详情' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  async findOne(@Param('id') id: string) {
    return this.templateService.findById(id);
  }

  @Put(':id')
  @Permissions('template:update')
  @ApiOperation({ summary: '更新模板信息' })
  @ApiBody({ type: UpdateTemplateDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  async update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templateService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('template:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除模板' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  async remove(@Param('id') id: string) {
    await this.templateService.delete(id);
    return null;
  }

  @Post(':id/versions')
  @Permissions('template:create')
  @ApiOperation({ summary: '新增模板版本' })
  @ApiBody({ type: CreateTemplateVersionDto })
  @ApiResponse({ status: 201, description: '版本创建成功' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  async addVersion(
    @Param('id') id: string,
    @Body() dto: CreateTemplateVersionDto,
  ) {
    return this.templateService.addVersion(id, dto);
  }

  @Post(':id/publish')
  @Permissions('template:publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发布模板' })
  @ApiResponse({ status: 200, description: '发布成功' })
  @ApiResponse({ status: 400, description: '模板已发布' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  async publish(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.templateService.publish(id, user.sub);
  }

  @Get(':id/download')
  @Permissions('template:download')
  @ApiOperation({ summary: '获取已发布模板的下载信息' })
  async getDownloadInfo(@Param('id') id: string) {
    return this.templateService.getDownloadInfo(id);
  }
}
