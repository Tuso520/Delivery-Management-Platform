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

@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationLog: OperationLogService,
  ) {}

  async findAll() {
    const roles = await this.prisma.role.findMany({
      select: {
        id: true,
        roleCode: true,
        roleName: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            userRoles: true,
            rolePermissions: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return roles.map((role) => ({
      id: role.id,
      roleCode: role.roleCode,
      roleName: role.roleName,
      description: role.description,
      status: role.status,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      userCount: role._count.userRoles,
      permissionCount: role._count.rolePermissions,
    }));
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
        createdAt: true,
        updatedAt: true,
        rolePermissions: {
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

    return {
      ...role,
      permissions: role.rolePermissions.map((rp) => rp.permission),
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
    const role = await this.prisma.role.findUnique({ where: { id } });

    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    const updated = await this.prisma.role.update({
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
        updatedAt: true,
      },
    });

    return updated;
  }

  async delete(id: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id } });

    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    // Check if role has users assigned
    const userCount = await this.prisma.userRole.count({
      where: { roleId: id },
    });

    if (userCount > 0) {
      throw new BadRequestException('该角色下还有用户，无法删除。请先移除用户关联');
    }

    await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await this.prisma.role.delete({ where: { id } });
  }

  async assignPermissions(
    roleId: string,
    dto: AssignPermissionsDto,
    operatorId: string,
  ) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });

    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    // Use transaction to atomically replace permissions
    await this.prisma.$transaction(async (tx) => {
      // Remove existing permissions
      await tx.rolePermission.deleteMany({
        where: { roleId },
      });

      // Create new permission assignments
      if (dto.permissionIds.length > 0) {
        const permissionAssignments = dto.permissionIds.map((permissionId) => ({
          roleId,
          permissionId,
        }));

        await tx.rolePermission.createMany({
          data: permissionAssignments,
        });
      }
    });
    await this.operationLog.log({
      userId: operatorId,
      module: 'permission',
      action: 'assign_role_permissions',
      targetType: 'role',
      targetId: roleId,
      afterData: { permissionIds: dto.permissionIds },
    });

    return this.findById(roleId);
  }
}
