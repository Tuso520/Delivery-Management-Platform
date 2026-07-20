import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import { BatchFieldOptionsDto, ChangeFieldValueStatusDto, CreateFieldValueDto, QueryFieldValuesDto, SortFieldValuesDto, UpdateFieldValueDto } from './dto/field-configuration.dto';
import { FieldConfigurationService } from './field-configuration.service';

@ApiTags('FieldConfiguration')
@ApiBearerAuth('JWT-auth')
@Controller('field-config')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions({ all: ['field_setting:manage'] })
export class FieldConfigurationController {
  constructor(private readonly service: FieldConfigurationService) {}

  @Get('categories')
  @RequirePermissions({ all: ['field_setting:manage'] })
  @ApiOperation({ summary: '获取字段设置的全部分类' })
  findCategories() { return this.service.findCategories(); }

  @Get('categories/:categoryId')
  @RequirePermissions({ all: ['field_setting:manage'] })
  findCategory(@Param('categoryId') categoryId: string) { return this.service.findCategory(categoryId); }

  @Get('categories/:categoryId/values')
  @RequirePermissions({ all: ['field_setting:manage'] })
  findValues(@Param('categoryId') categoryId: string, @Query() query: QueryFieldValuesDto) {
    return this.service.findValues(categoryId, query);
  }

  @Post('categories/:categoryId/values')
  @RequirePermissions({ all: ['field_setting:manage'] })
  create(@Param('categoryId') categoryId: string, @Body() dto: CreateFieldValueDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(categoryId, dto, user.sub);
  }

  @Patch('values/:id')
  @RequirePermissions({ all: ['field_setting:manage'] })
  update(@Param('id') id: string, @Body() dto: UpdateFieldValueDto, @CurrentUser() user: JwtPayload) {
    return this.service.update(id, dto, user.sub);
  }

  @Patch('values/:id/status')
  @RequirePermissions({ all: ['field_setting:manage'] })
  changeStatus(@Param('id') id: string, @Body() dto: ChangeFieldValueStatusDto, @CurrentUser() user: JwtPayload) {
    return this.service.changeStatus(id, dto.status, user.sub);
  }

  @Put('categories/:categoryId/sort')
  @RequirePermissions({ all: ['field_setting:manage'] })
  sort(@Param('categoryId') categoryId: string, @Body() dto: SortFieldValuesDto, @CurrentUser() user: JwtPayload) {
    return this.service.sort(categoryId, dto.items, user.sub);
  }

  @Get('values/:id/reference-status')
  @RequirePermissions({ all: ['field_setting:manage'] })
  referenceStatus(@Param('id') id: string) { return this.service.getReferenceStatus(id); }

  @Delete('values/:id')
  @RequirePermissions({ all: ['field_setting:manage'] })
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) { return this.service.remove(id, user.sub); }
}

@ApiTags('FieldOptions')
@ApiBearerAuth('JWT-auth')
@Controller('field-options')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FieldOptionsController {
  constructor(private readonly service: FieldConfigurationService) {}

  @Post('batch')
  @RequirePermissions({ any: [] })
  @ApiOperation({ summary: '批量读取多个分类的已启用字段选项' })
  findEnabledBatch(@Body() dto: BatchFieldOptionsDto) { return this.service.findEnabledBatch(dto.codes); }

  @Get(':code')
  @RequirePermissions({ any: [] })
  @ApiOperation({ summary: '供业务表单读取已启用字段选项' })
  findEnabled(@Param('code') code: string) { return this.service.findEnabled(code); }
}
