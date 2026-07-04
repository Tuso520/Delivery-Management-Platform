import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';

import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { PermissionService } from './permission.service';


@ApiTags('Permissions')
@ApiBearerAuth('JWT-auth')
@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('SUPER_ADMIN', 'SYSTEM_ADMIN')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get()
  @Permissions('permission:view')
  @ApiOperation({ summary: '获取权限列表（按资源分组）' })
  @ApiResponse({
    status: 200,
    description: '权限列表（按资源分组）',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: [
          {
            resource: 'user',
            permissions: [
              {
                id: 'uuid',
                permissionCode: 'user:view',
                permissionName: '查看用户',
                resource: 'user',
                action: 'view',
                description: '查看用户列表和详情',
                createdAt: '2026-06-01T00:00:00.000Z',
              },
            ],
          },
        ],
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async findAll() {
    return this.permissionService.findAll();
  }
}
