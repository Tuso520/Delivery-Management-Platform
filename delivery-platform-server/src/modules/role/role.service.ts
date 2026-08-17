import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { OperationLogService } from '../operation-log/operation-log.service';

import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const ROLE_STATUSES = new Set(['Active', 'Inactive']);

@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationLog: OperationLogService,
  ) {}

  async findAll() {
    const [roles, activePermissionCount] = await Promise.all([
      this.prisma.role.findMany({
      select: {
        id: true,
        roleCode: true,
        roleName: true,
        description: true,
        status: true,
        isProtected: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            userRoles: true,
            rolePermissions: {
              where: { permission: { deprecatedAt: null } },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      }),
      this.prisma.permission.count({ where: { deprecatedAt: null } }),
    ]);

    return roles.map((role) => ({
      id: role.id,
      roleCode: role.roleCode,
      roleName: role.roleName,
      description: role.description,
      status: role.status,
      isProtected: role.isProtected,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      userCount: role._count.userRoles,
      permissionCount: role.isProtected ? activePermissionCount : role._count.rolePermissions,
    }));
  }

  async findAssignable(operatorRoles: string[]) {
    const canAssignProtectedRole = operatorRoles.includes('SUPER_ADMIN');
    return this.prisma.role.findMany({
      where: {
        status: 'Active',
        ...(canAssignProtectedRole ? {} : { isProtected: false }),
      },
      select: {
        id: true,
        roleCode: true,
        roleName: true,
        description: true,
        status: true,
        isProtected: true,
      },
      orderBy: [{ isProtected: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: {
        id: true,
        roleCode: true,
        roleName: true,
        description: true,
        status: true,
        isProtected: true,
        createdAt: true,
        updatedAt: true,
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
    });

    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    const permissions = role.isProtected
      ? await this.prisma.permission.findMany({
          where: { deprecatedAt: null },
          select: {
            id: true,
            permissionCode: true,
            permissionName: true,
            resource: true,
            action: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { permissionCode: 'asc' }],
        })
      : role.rolePermissions.map((rp) => rp.permission);

    return {
      ...role,
      permissions,
    };
  }

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({
      where: { roleCode: dto.roleCode },
    });

    if (existing) {
      throw new ConflictException('角色编码已存在');
    }

    const role = await this.prisma.role.create({
      data: {
        roleCode: dto.roleCode,
        roleName: dto.roleName,
        description: dto.description,
      },
      select: {
        id: true,
        roleCode: true,
        roleName: true,
        description: true,
        status: true,
        createdAt: true,
      },
    });

    return role;
  }

  async update(id: string, dto: UpdateRoleDto) {
    if (dto.status !== undefined && !ROLE_STATUSES.has(dto.status)) {
      throw new BadRequestException('角色状态只能是 Active 或 Inactive');
    }

    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id } });

      if (!role) {
        throw new NotFoundException('角色不存在');
      }
      if (role.isProtected && dto.status && dto.status !== 'Active') {
        throw new BadRequestException('超级管理员角色必须保持启用');
      }

      const statusChanged = dto.status !== undefined && dto.status !== role.status;
      const updated = await tx.role.update({
        where: { id },
        data: {
          roleName: dto.roleName,
          description: dto.description,
          status: dto.status,
        },
        select: {
          id: true,
          roleCode: true,
          roleName: true,
          description: true,
          status: true,
          isProtected: true,
          updatedAt: true,
        },
      });

      if (statusChanged) {
        await tx.user.updateMany({
          where: {
            deletedAt: null,
            userRoles: { some: { roleId: id } },
          },
          data: { permissionVersion: { increment: 1 } },
        });
      }

      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id } });

    if (!role) {
      throw new NotFoundException('角色不存在');
    }
    if (role.isProtected) {
      throw new BadRequestException('超级管理员角色不可删除');
    }

    // Check if role has users assigned
    const userCount = await this.prisma.userRole.count({
      where: { roleId: id },
    });

    if (userCount > 0) {
      throw new BadRequestException('该角色下还有用户，无法删除。请先移除用户关联');
    }

    await this.prisma.role.update({
      where: { id },
      data: { status: 'Inactive' },
    });
  }

  async assignPermissions(roleId: string, dto: AssignPermissionsDto, operatorId: string) {
    const permissionIds = [...new Set(dto.permissionIds)];
    if (permissionIds.length !== dto.permissionIds.length) {
      throw new BadRequestException('权限列表中存在重复项');
    }

    await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({
        where: { id: roleId },
        select: {
          id: true,
          isProtected: true,
          rolePermissions: {
            where: { permission: { deprecatedAt: null } },
            select: { permissionId: true },
          },
        },
      });
      if (!role) {
        throw new NotFoundException('角色不存在');
      }
      if (role.isProtected) {
        throw new BadRequestException('超级管理员始终拥有全部权限，权限集合不可修改');
      }

      const permissions = await tx.permission.findMany({
        where: { id: { in: permissionIds }, deprecatedAt: null },
        select: { id: true },
      });
      if (permissions.length !== permissionIds.length) {
        throw new BadRequestException('权限不存在');
      }

      const existingIds = role.rolePermissions.map(({ permissionId }) => permissionId);
      const permissionsChanged =
        existingIds.length !== permissionIds.length ||
        permissionIds.some((permissionId) => !existingIds.includes(permissionId));
      if (permissionsChanged) {
        if (existingIds.length > 0) {
          await tx.rolePermission.deleteMany({
            where: { roleId, permissionId: { in: existingIds } },
          });
        }
        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
          });
        }
        await tx.user.updateMany({
          where: {
            deletedAt: null,
            userRoles: { some: { roleId } },
          },
          data: { permissionVersion: { increment: 1 } },
        });
      }
      await this.operationLog.log(
        {
          userId: operatorId,
          module: 'permission',
          action: 'assign_role_permissions',
          targetType: 'role',
          targetId: roleId,
          beforeData: { permissionIds: existingIds },
          afterData: { permissionIds },
        },
        tx,
      );
    });

    return this.findById(roleId);
  }
}
