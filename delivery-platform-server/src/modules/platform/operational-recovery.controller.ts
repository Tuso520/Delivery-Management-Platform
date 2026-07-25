import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import {
  type FailureKind,
  OperationalRecoveryService,
} from './operational-recovery.service';

@ApiTags('OperationalRecovery')
@ApiBearerAuth('JWT-auth')
@Controller('operational-failures')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OperationalRecoveryController {
  constructor(private readonly recovery: OperationalRecoveryService) {}

  @Get()
  @RequirePermissions({ any: ['system_setting:view', 'system_setting:manage'] })
  @ApiOperation({ summary: '查询审计、Outbox 与文件处理失败状态' })
  findFailures(@Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '50', 10);
    return this.recovery.findFailures(Number.isFinite(parsed) ? parsed : 50);
  }

  @Post(':kind/:id/retry')
  @RequirePermissions({ all: ['system_setting:manage'] })
  @ApiOperation({ summary: '重新入队或恢复失败任务' })
  retry(
    @Param('kind') kind: FailureKind,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.recovery.retry(kind, id);
  }
}
