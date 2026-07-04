import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { UpsertSystemConfigDto } from './dto/system-config.dto';
import { SystemConfigService } from './system-config.service';

@ApiTags('SystemConfig')
@ApiBearerAuth('JWT-auth')
@Controller('system-config')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('SUPER_ADMIN', 'SYSTEM_ADMIN')
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Public()
  @Roles()
  @Permissions()
  @Get('public')
  @ApiOperation({ summary: '获取登录页允许匿名读取的平台配置' })
  getPublic() {
    return this.systemConfigService.getPublic();
  }

  @Get()
  @Permissions('system:manage_config')
  @ApiOperation({ summary: '获取所有系统配置' })
  @ApiResponse({
    status: 200,
    description: '系统配置列表',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: [
          {
            id: 'uuid',
            configKey: 'project_code_prefix',
            configValue: 'PRJ',
            description: '项目编号前缀',
            configType: 'string',
            updatedBy: null,
            createdAt: '2026-06-22T10:00:00.000Z',
            updatedAt: '2026-06-22T10:00:00.000Z',
          },
        ],
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async findAll() {
    return this.systemConfigService.findAll();
  }

  @Get('batch')
  @Permissions('system:manage_config')
  @ApiOperation({ summary: '批量查询配置' })
  @ApiResponse({
    status: 200,
    description: '批量配置键值对',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          project_code_prefix: 'PRJ',
          default_page_size: '20',
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async getMany(@Query('keys') keys: string) {
    const keyList = keys ? keys.split(',').map((k) => k.trim()) : [];
    return this.systemConfigService.getMany(keyList);
  }

  @Get(':key')
  @Permissions('system:manage_config')
  @ApiOperation({ summary: '根据Key获取配置' })
  @ApiResponse({
    status: 200,
    description: '配置详情',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          id: 'uuid',
          configKey: 'project_code_prefix',
          configValue: 'PRJ',
          description: '项目编号前缀',
          configType: 'string',
          updatedBy: null,
          createdAt: '2026-06-22T10:00:00.000Z',
          updatedAt: '2026-06-22T10:00:00.000Z',
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: '配置项不存在' })
  async findOne(@Param('key') key: string) {
    return this.systemConfigService.findByKey(key);
  }

  @Put(':key')
  @Permissions('system:manage_config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建或更新系统配置' })
  @ApiBody({ type: UpsertSystemConfigDto })
  @ApiResponse({
    status: 200,
    description: '创建或更新成功',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          id: 'uuid',
          configKey: 'project_code_prefix',
          configValue: 'PRJ',
          description: '项目编号前缀',
          configType: 'string',
          updatedBy: 'uuid',
          createdAt: '2026-06-22T10:00:00.000Z',
          updatedAt: '2026-06-22T10:00:00.000Z',
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async upsert(
    @Param('key') key: string,
    @Body() dto: UpsertSystemConfigDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.systemConfigService.upsert(
      key,
      dto.configValue,
      dto.description,
      dto.configType,
      userId,
    );
  }

  @Delete(':key')
  @Permissions('system:manage_config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除系统配置' })
  @ApiResponse({
    status: 200,
    description: '删除成功',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: null,
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: '配置项不存在' })
  async remove(@Param('key') key: string) {
    await this.systemConfigService.delete(key);
    return null;
  }
}
