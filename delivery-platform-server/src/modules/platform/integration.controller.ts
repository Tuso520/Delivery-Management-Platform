import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { QueryIntegrationSyncLogDto, UpdateTargetIntegrationDto } from './dto/integration.dto';
import { IntegrationService } from './integration.service';

@ApiTags('Integrations')
@ApiBearerAuth('JWT-auth')
@Controller('integrations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}

  @Get()
  @RequirePermissions({ any: ['integration:view', 'integration:manage'] })
  @ApiOperation({ summary: '获取飞书和企业微信集成配置' })
  findAll() {
    return this.integrationService.findAll();
  }

  @Get(':provider')
  @RequirePermissions({ any: ['integration:view', 'integration:manage'] })
  @ApiOperation({ summary: '获取单个集成配置' })
  findOne(@Param('provider') provider: string) {
    return this.integrationService.findByProvider(provider);
  }

  @Patch(':provider')
  @RequirePermissions({ all: ['integration:manage'] })
  @ApiOperation({ summary: '更新集成配置，Secret 写入后仅返回掩码' })
  update(
    @Param('provider') provider: string,
    @Body() dto: UpdateTargetIntegrationDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.integrationService.update(provider, dto, userId);
  }

  @Post(':provider/test')
  @RequirePermissions({ all: ['integration:manage'] })
  @ApiOperation({ summary: '测试集成连接' })
  test(@Param('provider') provider: string, @CurrentUser('sub') userId: string) {
    return this.integrationService.testConnection(provider, userId);
  }

  @Post(':provider/sync-contacts')
  @RequirePermissions({ all: ['integration:manage'] })
  @ApiOperation({ summary: '同步通讯录到统一用户和外部身份' })
  syncContacts(@Param('provider') provider: string, @CurrentUser('sub') userId: string) {
    return this.integrationService.syncContacts(provider, userId);
  }

  @Post(':provider/test-notification')
  @RequirePermissions({ all: ['integration:manage'] })
  @ApiOperation({ summary: '发送集成测试通知' })
  testNotification(@Param('provider') provider: string, @CurrentUser('sub') userId: string) {
    return this.integrationService.testNotification(provider, userId);
  }

  @Get(':provider/sync-logs')
  @RequirePermissions({ any: ['integration:view', 'integration:manage'] })
  @ApiOperation({ summary: '分页查询集成操作日志' })
  @ApiOkResponse({
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: { items: [], page: 1, pageSize: 20, total: 0 },
        timestamp: '2026-07-12T00:00:00.000Z',
      },
    },
  })
  findSyncLogs(@Param('provider') provider: string, @Query() query: QueryIntegrationSyncLogDto) {
    return this.integrationService.findSyncLogs(provider, query);
  }
}
