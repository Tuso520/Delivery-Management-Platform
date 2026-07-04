import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleService } from './role.service';


@ApiTags('Roles')
@ApiBearerAuth('JWT-auth')
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('SUPER_ADMIN', 'SYSTEM_ADMIN')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @Permissions('role:view')
  @ApiOperation({ summary: '获取角色列表（含用户数和权限数）' })
  @ApiResponse({
    status: 200,
    description: '角色列表',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: [
          {
            id: 'uuid',
            roleCode: 'SUPER_ADMIN',
            roleName: '超级管理员',
            description: '系统超级管理员',
            status: 'Active',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-22T08:00:00.000Z',
            userCount: 1,
            permissionCount: 20,
          },
        ],
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async findAll() {
    return this.roleService.findAll();
  }

  @Post()
  @Permissions('role:create')
  @ApiOperation({ summary: '创建角色' })
  @ApiBody({ type: CreateRoleDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 409, description: '角色编码已存在' })
  async create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  @Get(':id')
  @Permissions('role:view')
  @ApiOperation({ summary: '获取角色详情（含权限列表）' })
  @ApiResponse({ status: 200, description: '角色详情' })
  @ApiResponse({ status: 404, description: '角色不存在' })
  async findOne(@Param('id') id: string) {
    return this.roleService.findById(id);
  }

  @Put(':id')
  @Permissions('role:update')
  @ApiOperation({ summary: '更新角色信息' })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '角色不存在' })
  async update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roleService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('role:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除角色' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '角色不存在' })
  @ApiResponse({ status: 400, description: '角色下还有用户，无法删除' })
  async remove(@Param('id') id: string) {
    await this.roleService.delete(id);
    return null;
  }

  @Post(':id/permissions')
  @Permissions('role:assign_permission')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分配角色权限' })
  @ApiBody({ type: AssignPermissionsDto })
  @ApiResponse({ status: 200, description: '分配成功' })
  @ApiResponse({ status: 404, description: '角色不存在' })
  async assignPermissions(
    @Param('id') id: string,
    @Body() dto: AssignPermissionsDto,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.roleService.assignPermissions(id, dto, operatorId);
  }
}
