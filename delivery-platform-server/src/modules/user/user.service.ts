import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { OperationLogService } from '../operation-log/operation-log.service';

import { AssignRolesDto } from './dto/assign-roles.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';

interface UserListItem {
  id: string;
  username: string;
  realName: string;
  email: string | null;
  phone: string | null;
  departmentId: string | null;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: Array<{ id: string; roleCode: string; roleName: string }>;
}

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationLog: OperationLogService,
  ) {}

  async findAll(query: QueryUserDto): Promise<PaginatedResult<UserListItem>> {
    const { page = 1, pageSize = 20, keyword, status, departmentId } = query;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };

    if (keyword) {
      where.OR = [
        { username: { contains: keyword } },
        { realName: { contains: keyword } },
        { email: { contains: keyword } },
      ];
    }

    if (status) {
      where.status = status as UserStatus;
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    const [total, list] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          realName: true,
          email: true,
          phone: true,
          departmentId: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          userRoles: {
            select: {
              role: {
                select: {
                  id: true,
                  roleCode: true,
                  roleName: true,
                },
              },
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const mappedList = list.map((user) => ({
      ...user,
      roles: user.userRoles.map((ur) => ur.role),
    }));

    return {
      items: mappedList,
      page,
      pageSize,
      total,
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        username: true,
        realName: true,
        email: true,
        phone: true,
        departmentId: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        userRoles: {
          select: {
            role: {
              select: {
                id: true,
                roleCode: true,
                roleName: true,
                rolePermissions: {
                  where: { permission: { deprecatedAt: null } },
                  select: {
                    permission: {
                      select: {
                        id: true,
                        permissionCode: true,
                        permissionName: true,
                        resource: true,
                        action: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return {
      ...user,
      roles: user.userRoles.map((ur) => ur.role),
    };
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (existing) {
      throw new ConflictException('用户名已存在');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        password: hashedPassword,
        realName: dto.realName,
        email: dto.email,
        phone: dto.phone,
        departmentId: dto.departmentId,
      },
      select: {
        id: true,
        username: true,
        realName: true,
        email: true,
        phone: true,
        departmentId: true,
        status: true,
        createdAt: true,
      },
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        realName: dto.realName,
        email: dto.email,
        phone: dto.phone,
        departmentId: dto.departmentId,
      },
      select: {
        id: true,
        username: true,
        realName: true,
        email: true,
        phone: true,
        departmentId: true,
        status: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const revokedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          deletedAt: revokedAt,
          permissionVersion: { increment: 1 },
        },
      });
      await tx.refreshSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt, revokeReason: 'USER_DELETED' },
      });
    });
  }

  async assignRoles(userId: string, dto: AssignRolesDto, operatorId: string) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: {
          id: true,
          userRoles: { select: { roleId: true } },
        },
      });
      if (!user) {
        throw new NotFoundException('用户不存在');
      }
      const roles = await tx.role.findMany({
        where: { id: { in: dto.roleIds }, status: 'Active' },
        select: { id: true, defaultDataScope: true },
      });
      if (roles.length !== new Set(dto.roleIds).size) {
        throw new BadRequestException('角色不存在或已停用');
      }

      // Remove existing roles
      await tx.userRole.deleteMany({
        where: { userId },
      });

      // Create new role assignments
      if (dto.roleIds.length > 0) {
        const roleAssignments = roles.map((role) => ({
          userId,
          roleId: role.id,
          dataScope: role.defaultDataScope,
        }));

        await tx.userRole.createMany({
          data: roleAssignments,
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: { permissionVersion: { increment: 1 } },
      });
      await this.operationLog.log(
        {
          userId: operatorId,
          module: 'permission',
          action: 'assign_user_roles',
          targetType: 'user',
          targetId: userId,
          beforeData: { roleIds: user.userRoles.map(({ roleId }) => roleId) },
          afterData: { roleIds: roles.map(({ id }) => id) },
        },
        tx,
      );
    });

    return this.findById(userId);
  }

  async disable(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (user.status === 'Inactive') {
      throw new BadRequestException('用户已被禁用');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          status: 'Inactive',
          permissionVersion: { increment: 1 },
        },
        select: {
          id: true,
          username: true,
          realName: true,
          status: true,
        },
      });
      await tx.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'USER_DISABLED' },
      });
      return updated;
    });
  }

  async enable(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (user.status === 'Active') {
      throw new BadRequestException('用户已是活跃状态');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'Active',
        permissionVersion: { increment: 1 },
      },
      select: {
        id: true,
        username: true,
        realName: true,
        status: true,
      },
    });
  }

  async resetPassword(userId: string, dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          permissionVersion: { increment: 1 },
        },
      });
      await tx.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'PASSWORD_RESET' },
      });
    });

    return { message: '密码重置成功' };
  }
}
