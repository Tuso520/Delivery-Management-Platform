import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedOnly } from '../../common/decorators/authenticated-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import {
  BatchFieldOptionsDto,
  ChangeFieldConfigurationStatusDto,
  ChangeFieldValueStatusDto,
  CheckFieldCodeDto,
  CreateFieldConfigurationDto,
  CreateFieldValueDto,
  QueryFieldConfigurationsDto,
  QueryFieldValuesDto,
  SortFieldConfigurationsDto,
  SortFieldValuesDto,
  UpdateFieldConfigurationDto,
  UpdateFieldValueDto,
} from './dto/field-configuration.dto';
import { FieldConfigurationService } from './field-configuration.service';

@ApiTags('FieldConfiguration')
@ApiBearerAuth('JWT-auth')
@Controller('field-config')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FieldConfigurationController {
  constructor(private readonly service: FieldConfigurationService) {}

  @Get()
  @RequirePermissions({ all: ['field_setting:view'] })
  @ApiOperation({ summary: '获取字段配置' })
  findConfigurations(@Query() query: QueryFieldConfigurationsDto) {
    return this.service.findConfigurations(query);
  }

  @Get('module/:moduleCode')
  @RequirePermissions({ all: ['field_setting:view'] })
  @ApiOperation({ summary: '获取指定模块的字段配置' })
  findConfigurationsByModule(
    @Param('moduleCode') moduleCode: string,
    @Query() query: QueryFieldConfigurationsDto,
  ) {
    return this.service.findConfigurationsByModule(moduleCode, query.includeDisabled);
  }

  @Get('version')
  @RequirePermissions({ all: ['field_setting:view'] })
  @ApiOperation({ summary: '获取字段配置变更版本' })
  getConfigurationVersion() {
    return this.service.getConfigurationVersion();
  }

  @Get('code-availability')
  @RequirePermissions({ all: ['field_setting:view'] })
  @ApiOperation({ summary: '校验字段编码唯一性' })
  checkFieldCode(@Query() query: CheckFieldCodeDto) {
    return this.service.isFieldCodeAvailable(query.fieldCode, query.excludeId);
  }

  @Post()
  @RequirePermissions({ all: ['field_setting:edit'] })
  @ApiOperation({ summary: '新增字段配置' })
  createField(@Body() dto: CreateFieldConfigurationDto, @CurrentUser() user: JwtPayload) {
    return this.service.createField(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions({ all: ['field_setting:edit'] })
  @ApiOperation({ summary: '编辑字段配置' })
  updateField(
    @Param('id') id: string,
    @Body() dto: UpdateFieldConfigurationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateField(id, dto, user.sub);
  }

  @Patch(':id/status')
  @RequirePermissions({ all: ['field_setting:edit'] })
  @ApiOperation({ summary: '启用或停用字段配置' })
  changeFieldStatus(
    @Param('id') id: string,
    @Body() dto: ChangeFieldConfigurationStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.changeFieldStatus(id, dto.enabled, user.sub);
  }

  @Put('sort')
  @RequirePermissions({ all: ['field_setting:edit'] })
  @ApiOperation({ summary: '调整字段配置排序' })
  sortFields(@Body() dto: SortFieldConfigurationsDto, @CurrentUser() user: JwtPayload) {
    return this.service.sortFields(dto.items, user.sub);
  }

  @Get('categories')
  @RequirePermissions({ all: ['field_setting:view'] })
  @ApiOperation({ summary: '获取字段设置的全部分类' })
  findCategories() { return this.service.findCategories(); }

  @Get('categories/:categoryId')
  @RequirePermissions({ all: ['field_setting:view'] })
  findCategory(@Param('categoryId') categoryId: string) { return this.service.findCategory(categoryId); }

  @Get('categories/:categoryId/values')
  @RequirePermissions({ all: ['field_setting:view'] })
  findValues(@Param('categoryId') categoryId: string, @Query() query: QueryFieldValuesDto) {
    return this.service.findValues(categoryId, query);
  }

  @Post('categories/:categoryId/values')
  @RequirePermissions({ all: ['field_setting:option_create'] })
  create(@Param('categoryId') categoryId: string, @Body() dto: CreateFieldValueDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(categoryId, dto, user.sub);
  }

  @Patch('values/:id')
  @RequirePermissions({ all: ['field_setting:edit'] })
  update(@Param('id') id: string, @Body() dto: UpdateFieldValueDto, @CurrentUser() user: JwtPayload) {
    return this.service.update(id, dto, user.sub);
  }

  @Patch('values/:id/status')
  @RequirePermissions({ all: ['field_setting:option_toggle'] })
  changeStatus(@Param('id') id: string, @Body() dto: ChangeFieldValueStatusDto, @CurrentUser() user: JwtPayload) {
    return this.service.changeStatus(id, dto.status, user.sub);
  }

  @Put('categories/:categoryId/sort')
  @RequirePermissions({ all: ['field_setting:edit'] })
  sort(@Param('categoryId') categoryId: string, @Body() dto: SortFieldValuesDto, @CurrentUser() user: JwtPayload) {
    return this.service.sort(categoryId, dto.items, user.sub);
  }

  @Get('values/:id/reference-status')
  @RequirePermissions({ all: ['field_setting:view'] })
  referenceStatus(@Param('id') id: string) { return this.service.getReferenceStatus(id); }

  @Delete('values/:id')
  @RequirePermissions({ all: ['field_setting:edit'] })
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) { return this.service.remove(id, user.sub); }
}

@ApiTags('FieldOptions')
@ApiBearerAuth('JWT-auth')
@Controller('field-options')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FieldOptionsController {
  constructor(private readonly service: FieldConfigurationService) {}

  @Get('module/:moduleCode')
  @AuthenticatedOnly()
  @ApiOperation({ summary: '供业务页面读取指定模块的字段配置' })
  findByModule(@Param('moduleCode') moduleCode: string) {
    return this.service.findBusinessConfigurationsByModule(moduleCode);
  }

  @Post('batch')
  @AuthenticatedOnly()
  @ApiOperation({ summary: '批量读取多个分类的已启用字段选项' })
  findEnabledBatch(@Body() dto: BatchFieldOptionsDto) { return this.service.findEnabledBatch(dto.codes); }

  @Get(':code')
  @AuthenticatedOnly()
  @ApiOperation({ summary: '供业务表单读取已启用字段选项' })
  findEnabled(@Param('code') code: string) { return this.service.findEnabled(code); }
}
