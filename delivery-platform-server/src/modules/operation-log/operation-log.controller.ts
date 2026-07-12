import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { QueryOperationLogDto } from './dto/operation-log.dto';
import { OperationLogService } from './operation-log.service';

@ApiTags('AuditLogs')
@ApiBearerAuth('JWT-auth')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditLogController {
  constructor(private readonly operationLogService: OperationLogService) {}

  @Get()
  @RequirePermissions({ all: ['audit_log:view'] })
  @ApiOperation({ summary: '分页查询审计日志' })
  @ApiPaginatedResponse('审计日志分页结果')
  findAll(@Query() query: QueryOperationLogDto) {
    return this.operationLogService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions({ all: ['audit_log:view'] })
  @ApiOperation({ summary: '获取审计日志详情' })
  findOne(@Param('id') id: string) {
    return this.operationLogService.findById(id);
  }
}
