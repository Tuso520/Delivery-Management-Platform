import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionEffect, Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { OperationLogService } from '../operation-log/operation-log.service';

import { ReplacePermissionAssignmentsDto } from './dto/permission-assignment.dto';

@Injectable()
export class PermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationLog: OperationLogService,
  ) {}

  async findAll() {
    const permissions = await this.prisma.permission.findMany({
      where: { deprecatedAt: null },
      select: {
        id: true,
        permissionCode: true,
        permissionName: true,
        resource: true,
        action: true,
        description: true,
        createdAt: true,
      },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });

    // Group by resource
    const groupedMap = new Map<string, typeof permissions>();

    for (const perm of permissions) {
      const existing = groupedMap.get(perm.resource) || [];
      existing.push({
        id: perm.id,
        permissionCode: perm.permissionCode,
        permissionName: perm.permissionName,
        resource: perm.resource,
        action: perm.action,
        description: perm.description,
        createdAt: perm.createdAt,
      });
      groupedMap.set(perm.resource, existing);
    }

    return Array.from(groupedMap.entries()).map(([resource, perms]) => ({
      resource,
      permissions: perms.map((permission) => ({
        ...permission,
        actionGroup: this.resolveActionGroup(permission.action),
      })),
    }));
  }

  async replaceUserOverrides(
    userId: string,
    dto: ReplacePermissionAssignmentsDto,
    operatorId: string,
  ) {
    this.assertDisjoint(dto);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('用户不存在');
      const assignments = await this.resolveAssignments(tx, dto);
      await tx.userPermissionOverride.deleteMany({ where: { userId } });
      if (assignments.length > 0) {
        await tx.userPermissionOverride.createMany({
          data: assignments.map(({ permissionId, effect }) => ({ userId, permissionId, effect })),
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
          action: 'replace_user_overrides',
          targetType: 'user',
          targetId: userId,
          afterData: { allow: dto.allow, deny: dto.deny },
        },
        tx,
      );
      return { userId, allow: dto.allow, deny: dto.deny };
    });
  }

  async replaceDepartmentGrants(
    departmentId: string,
    dto: ReplacePermissionAssignmentsDto,
    operatorId: string,
  ) {
    this.assertDisjoint(dto);
    return this.prisma.$transaction(async (tx) => {
      const departments = await tx.department.findMany({
        select: { id: true, parentId: true },
      });
      if (!departments.some(({ id }) => id === departmentId)) {
        throw new NotFoundException('部门不存在');
      }
      const assignments = await this.resolveAssignments(tx, dto);
      await tx.departmentPermissionGrant.deleteMany({ where: { departmentId } });
      if (assignments.length > 0) {
        await tx.departmentPermissionGrant.createMany({
          data: assignments.map(({ permissionId, effect }) => ({
            departmentId,
            permissionId,
            effect,
          })),
        });
      }

      const affectedDepartments = this.collectDescendants(departments, departmentId);
      const affectedUsers = await tx.user.findMany({
        where: {
          deletedAt: null,
          OR: [
            { departmentId: { in: affectedDepartments } },
            { departmentMemberships: { some: { departmentId: { in: affectedDepartments } } } },
          ],
        },
        select: { id: true },
      });
      if (affectedUsers.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: affectedUsers.map(({ id }) => id) } },
          data: { permissionVersion: { increment: 1 } },
        });
      }
      await this.operationLog.log(
        {
          userId: operatorId,
          module: 'permission',
          action: 'replace_department_grants',
          targetType: 'department',
          targetId: departmentId,
          afterData: { ...dto, affectedUserCount: affectedUsers.length },
        },
        tx,
      );
      return { departmentId, allow: dto.allow, deny: dto.deny, affectedUsers: affectedUsers.length };
    });
  }

  private assertDisjoint(dto: ReplacePermissionAssignmentsDto): void {
    const denied = new Set(dto.deny);
    if (dto.allow.some((code) => denied.has(code))) {
      throw new BadRequestException('同一权限不能同时允许和禁止');
    }
  }

  private async resolveAssignments(
    tx: Prisma.TransactionClient,
    dto: ReplacePermissionAssignmentsDto,
  ): Promise<Array<{ permissionId: string; effect: PermissionEffect }>> {
    const requested = [...new Set([...dto.allow, ...dto.deny])];
    const permissions = await tx.permission.findMany({
      where: { permissionCode: { in: requested }, deprecatedAt: null },
      select: { id: true, permissionCode: true },
    });
    if (permissions.length !== requested.length) {
      throw new BadRequestException('包含不存在或已废弃的权限码');
    }
    const byCode = new Map(permissions.map((permission) => [permission.permissionCode, permission.id]));
    return [
      ...dto.allow.map((code) => ({ permissionId: byCode.get(code)!, effect: PermissionEffect.ALLOW })),
      ...dto.deny.map((code) => ({ permissionId: byCode.get(code)!, effect: PermissionEffect.DENY })),
    ];
  }

  private collectDescendants(
    departments: Array<{ id: string; parentId: string | null }>,
    rootId: string,
  ): string[] {
    const result = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const department of departments) {
        if (department.parentId && result.has(department.parentId) && !result.has(department.id)) {
          result.add(department.id);
          changed = true;
        }
      }
    }
    return [...result];
  }

  private resolveActionGroup(
    action: string,
  ): 'view' | 'download' | 'upload' | 'operate' {
    if (action.includes('download')) return 'download';
    if (action.includes('upload') || action === 'create') return 'upload';
    if (
      action === 'view' ||
      action.includes('preview') ||
      action.startsWith('view_')
    ) {
      return 'view';
    }
    return 'operate';
  }
}
