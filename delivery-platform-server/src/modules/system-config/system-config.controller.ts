import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { PatchSystemSettingsDto } from './dto/system-config.dto';
import { SystemConfigService } from './system-config.service';

@ApiTags('PublicSystemConfig')
@Controller('system-config')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Public()
  @Get('public')
  @ApiOperation({ summary: '获取登录页允许匿名读取的平台展示配置' })
  getPublic() {
    return this.systemConfigService.getPublic();
  }
}

@ApiTags('SystemSettings')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SystemSettingsController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get('system-settings')
  @RequirePermissions({ any: ['system_setting:view', 'system_setting:manage'] })
  @ApiOperation({ summary: '按明确 Schema 获取系统配置' })
  getSettings() {
    return this.systemConfigService.getSettings();
  }

  @Patch('system-settings')
  @RequirePermissions({ all: ['system_setting:manage'] })
  @ApiOperation({ summary: '按明确 Schema 局部更新系统配置' })
  updateSettings(@Body() dto: PatchSystemSettingsDto, @CurrentUser('sub') userId: string) {
    return this.systemConfigService.updateSettings(dto, userId);
  }

  @Get('system-time')
  @RequirePermissions({ any: ['system_setting:view', 'system_setting:manage'] })
  @ApiOperation({ summary: '获取服务器时间与时区' })
  getSystemTime() {
    return this.systemConfigService.getSystemTime();
  }
}
