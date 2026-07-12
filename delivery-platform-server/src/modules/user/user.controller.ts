import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiBody } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { AssignRolesDto } from './dto/assign-roles.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequirePermissions({ all: ['user:view'] })
  @ApiOperation({ summary: '获取用户列表（分页+搜索）' })
  @ApiResponse({
    status: 200,
    description: '用户列表',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          items: [
            {
              id: 'uuid',
              username: 'admin',
              realName: '管理员',
              email: 'admin@example.com',
              phone: '13800138000',
              departmentId: null,
              status: 'Active',
              lastLoginAt: '2026-06-22T08:00:00.000Z',
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-22T08:00:00.000Z',
              roles: [{ id: 'uuid', roleCode: 'SUPER_ADMIN', roleName: '超级管理员' }],
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async findAll(@Query() query: QueryUserDto) {
    return this.userService.findAll(query);
  }

  @Post()
  @RequirePermissions({ all: ['user:create'] })
  @ApiOperation({ summary: '创建用户' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: 201,
    description: '创建成功',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          id: 'uuid',
          username: 'zhangsan',
          realName: '张三',
          email: 'zhangsan@example.com',
          phone: '13800138001',
          departmentId: null,
          status: 'Active',
          createdAt: '2026-06-22T10:00:00.000Z',
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 409, description: '用户名已存在' })
  async create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Get(':id')
  @RequirePermissions({ all: ['user:view'] })
  @ApiOperation({ summary: '获取用户详情' })
  @ApiResponse({ status: 200, description: '用户详情' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  async findOne(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Put(':id')
  @RequirePermissions({ all: ['user:update'] })
  @ApiOperation({ summary: '更新用户信息' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions({ all: ['user:delete'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除用户（软删除）' })
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
  @ApiResponse({ status: 404, description: '用户不存在' })
  async remove(@Param('id') id: string) {
    await this.userService.softDelete(id);
    return null;
  }

  @Post(':id/roles')
  @RequirePermissions({ all: ['user:assign_role'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分配用户角色' })
  @ApiBody({ type: AssignRolesDto })
  @ApiResponse({ status: 200, description: '分配成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  async assignRoles(
    @Param('id') id: string,
    @Body() dto: AssignRolesDto,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.userService.assignRoles(id, dto, operatorId);
  }

  @Post(':id/disable')
  @RequirePermissions({ all: ['user:disable'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '禁用用户' })
  @ApiResponse({ status: 200, description: '禁用成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  async disable(@Param('id') id: string) {
    return this.userService.disable(id);
  }

  @Post(':id/enable')
  @RequirePermissions({ all: ['user:disable'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '启用用户' })
  @ApiResponse({ status: 200, description: '启用成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  async enable(@Param('id') id: string) {
    return this.userService.enable(id);
  }

  @Post(':id/reset-password')
  @RequirePermissions({ all: ['user:reset_password'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重置用户密码' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: '密码重置成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.userService.resetPassword(id, dto);
  }
}
