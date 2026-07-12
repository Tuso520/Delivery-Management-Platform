import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import {
  CreateDepartmentDto,
  CreateDictionaryCategoryDto,
  UpdateDepartmentDto,
  UpsertDictionaryItemDto,
} from './dto/platform.dto';
import { QueryRoleReferenceDto, QueryUserReferenceDto } from './dto/reference.dto';
import { ReferenceService } from './reference.service';

@ApiTags('Dictionaries')
@ApiBearerAuth('JWT-auth')
@Controller('dictionaries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DictionaryController {
  constructor(private readonly referenceService: ReferenceService) {}

  @Get()
  @RequirePermissions({ all: ['dictionary:view'] })
  @ApiOperation({ summary: '获取全部字典分类及有效选项' })
  findAll() {
    return this.referenceService.findDictionaries();
  }

  @Get(':code')
  @RequirePermissions({ all: ['dictionary:view'] })
  @ApiOperation({ summary: '按编码获取字典选项' })
  findByCode(@Param('code') code: string) {
    return this.referenceService.findDictionaryByCode(code);
  }

  @Post()
  @RequirePermissions({ all: ['dictionary:manage'] })
  create(@Body() dto: CreateDictionaryCategoryDto) {
    return this.referenceService.createDictionaryCategory(dto);
  }

  @Post(':id/items')
  @RequirePermissions({ all: ['dictionary:manage'] })
  upsertItem(@Param('id') id: string, @Body() dto: UpsertDictionaryItemDto) {
    return this.referenceService.upsertDictionaryItem(id, dto);
  }
}

@ApiTags('References')
@ApiBearerAuth('JWT-auth')
@Controller('references')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReferenceController {
  constructor(private readonly referenceService: ReferenceService) {}

  @Get('users')
  @ApiOperation({ summary: '获取业务表单可用的最小活动用户选项' })
  findUserOptions(@Query() query: QueryUserReferenceDto) {
    return this.referenceService.findUserOptions(query.purpose, query.projectId);
  }

  @Get('roles')
  @ApiOperation({ summary: '获取可用于业务选择器的有效角色' })
  findRoleOptions(@Query() query: QueryRoleReferenceDto) {
    return this.referenceService.findRoleOptions(query.purpose);
  }
}

@ApiTags('Departments')
@ApiBearerAuth('JWT-auth')
@Controller('departments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DepartmentController {
  constructor(private readonly referenceService: ReferenceService) {}

  @Get()
  @RequirePermissions({ all: ['department:view'] })
  @ApiOperation({ summary: '获取组织架构树' })
  findTree() {
    return this.referenceService.findDepartmentTree();
  }

  @Post()
  @RequirePermissions({ all: ['department:manage'] })
  create(@Body() dto: CreateDepartmentDto) {
    return this.referenceService.createDepartment(dto);
  }

  @Put(':id')
  @RequirePermissions({ all: ['department:manage'] })
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.referenceService.updateDepartment(id, dto);
  }

  @Delete(':id')
  @RequirePermissions({ all: ['department:manage'] })
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') id: string): Promise<null> {
    await this.referenceService.deactivateDepartment(id);
    return null;
  }
}
