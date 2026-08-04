import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { ReplacePermissionAssignmentsDto } from './dto/permission-assignment.dto';
import { PermissionService } from './permission.service';

@ApiTags('Permissions')
@ApiBearerAuth('JWT-auth')
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get()
  @RequirePermissions({ all: ['permission:view'] })
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

  @Put('users/:userId')
  @RequirePermissions({ all: ['user:assign_role'] })
  @ApiOperation({ summary: '替换用户显式允许/禁止权限' })
  replaceUserOverrides(
    @Param('userId') userId: string,
    @Body() dto: ReplacePermissionAssignmentsDto,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.permissionService.replaceUserOverrides(userId, dto, operatorId);
  }

  @Put('departments/:departmentId')
  @RequirePermissions({ all: ['department:manage'] })
  @ApiOperation({ summary: '替换组织显式允许/禁止权限' })
  replaceDepartmentGrants(
    @Param('departmentId') departmentId: string,
    @Body() dto: ReplacePermissionAssignmentsDto,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.permissionService.replaceDepartmentGrants(departmentId, dto, operatorId);
  }
}
