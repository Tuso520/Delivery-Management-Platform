import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';

import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { QueryOperationLogDto } from './dto/operation-log.dto';
import { OperationLogService } from './operation-log.service';

@ApiTags('OperationLogs')
@ApiBearerAuth('JWT-auth')
@Controller('operation-logs')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('SUPER_ADMIN', 'SYSTEM_ADMIN')
export class OperationLogController {
  constructor(private readonly operationLogService: OperationLogService) {}

  @Get()
  @Permissions('system:view_log')
  @ApiOperation({ summary: '获取操作日志列表（分页+筛选）' })
  @ApiResponse({
    status: 200,
    description: '操作日志列表',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          list: [
            {
              id: 'uuid',
              userId: 'uuid',
              module: 'project',
              action: 'view_cost',
              targetType: 'project',
              targetId: 'uuid',
              beforeData: null,
              afterData: null,
              ipAddress: '192.168.1.1',
              userAgent: 'Mozilla/5.0',
              result: 'success',
              createdAt: '2026-06-22T10:00:00.000Z',
              user: {
                id: 'uuid',
                username: 'admin',
                realName: '管理员',
              },
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async findAll(@Query() query: QueryOperationLogDto) {
    return this.operationLogService.findAll(query);
  }

  @Get(':id')
  @Permissions('system:view_log')
  @ApiOperation({ summary: '获取操作日志详情' })
  @ApiResponse({
    status: 200,
    description: '操作日志详情',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          id: 'uuid',
          userId: 'uuid',
          module: 'project',
          action: 'view_cost',
          targetType: 'project',
          targetId: 'uuid',
          beforeData: null,
          afterData: null,
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          result: 'success',
          createdAt: '2026-06-22T10:00:00.000Z',
          user: {
            id: 'uuid',
            username: 'admin',
            realName: '管理员',
          },
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: '日志不存在' })
  async findOne(@Param('id') id: string) {
    return this.operationLogService.findById(id);
  }
}
