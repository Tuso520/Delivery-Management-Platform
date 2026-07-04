import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import {
  CreateBackupDto,
  QueryPlatformDto,
  UpsertIntegrationDto,
} from './dto/platform.dto';
import { SystemOperationsService } from './system-operations.service';

@ApiTags('System Operations')
@ApiBearerAuth('JWT-auth')
@Controller('system-operations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SystemOperationsController {
  constructor(
    private readonly systemOperationsService: SystemOperationsService,
  ) {}

  @Get('storage')
  @Permissions('system:view_storage')
  @ApiOperation({ summary: '查询 MinIO 存储可用性和使用统计' })
  storageStatus() {
    return this.systemOperationsService.storageStatus();
  }

  @Get('backups')
  @Permissions('system:manage_backup')
  findBackups(@Query() query: QueryPlatformDto) {
    return this.systemOperationsService.findBackups(query);
  }

  @Post('backups')
  @Permissions('system:manage_backup')
  @ApiOperation({ summary: '执行 MySQL 逻辑备份并写入私有 MinIO' })
  createBackup(
    @Body() dto: CreateBackupDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.systemOperationsService.createBackup(dto, user.sub);
  }

  @Get('backups/:id/download')
  @Permissions('system:manage_backup')
  @RawResponse()
  async getBackupContent(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    const content = await this.systemOperationsService.getBackupContent(
      id,
      user.sub,
    );
    response.setHeader('Content-Type', 'application/sql');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(content.fileName)}`,
    );
    return new StreamableFile(content.stream);
  }

  @Get('integrations')
  @Permissions('integration:manage')
  findIntegrations() {
    return this.systemOperationsService.findIntegrations();
  }

  @Post('integrations')
  @Permissions('integration:manage')
  createIntegration(
    @Body() dto: UpsertIntegrationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.systemOperationsService.upsertIntegration(
      undefined,
      dto,
      user.sub,
    );
  }

  @Patch('integrations/:id')
  @Permissions('integration:manage')
  updateIntegration(
    @Param('id') id: string,
    @Body() dto: UpsertIntegrationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.systemOperationsService.upsertIntegration(id, dto, user.sub);
  }

  @Patch('integrations/:id/enabled/:enabled')
  @Permissions('integration:manage')
  toggleIntegration(
    @Param('id') id: string,
    @Param('enabled') enabled: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.systemOperationsService.toggleIntegration(
      id,
      enabled === 'true',
      user.sub,
    );
  }
}
