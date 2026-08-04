import { Injectable, NotFoundException } from '@nestjs/common';
import { PermissionEffect } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

export const SYSTEM_MINIMUM_PERMISSIONS = ['dashboard:view'] as const;

export interface ResolvedPermissions {
  roles: string[];
  permissions: string[];
}

interface PermissionDecision {
  effect: PermissionEffect;
  priority: number;
}

@Injectable()
export class PermissionResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForUser(userId: string): Promise<ResolvedPermissions> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: 'Active' },
      select: {
        departmentId: true,
        userRoles: {
          where: { role: { status: 'Active' } },
          select: {
            role: {
              select: {
                roleCode: true,
                rolePermissions: {
                  where: { permission: { deprecatedAt: null } },
                  select: { permission: { select: { permissionCode: true } } },
                },
              },
            },
          },
        },
        permissionOverrides: {
          where: { permission: { deprecatedAt: null } },
          select: {
            effect: true,
            permission: { select: { permissionCode: true } },
          },
        },
        departmentMemberships: {
          select: { departmentId: true },
        },
      },
    });
    if (!user) throw new NotFoundException('用户不存在');

    const roles = [...new Set(user.userRoles.map(({ role }) => role.roleCode))];
    const decisions = new Map<string, PermissionDecision>();

    // 用户显式覆盖优先于该用户直接分配的角色。
    for (const override of user.permissionOverrides) {
      decisions.set(override.permission.permissionCode, { effect: override.effect, priority: 0 });
    }
    for (const assignment of user.userRoles) {
      for (const { permission } of assignment.role.rolePermissions) {
        this.applyDecision(decisions, permission.permissionCode, PermissionEffect.ALLOW, 1);
      }
    }

    const initialDepartmentIds = new Set(
      user.departmentMemberships.map(({ departmentId }) => departmentId),
    );
    if (user.departmentId) initialDepartmentIds.add(user.departmentId);

    let currentIds = [...initialDepartmentIds];
    const visited = new Set<string>();
    let depth = 0;
    while (currentIds.length > 0) {
      if (depth >= 100) throw new Error('组织层级超过安全上限');
      const levelIds = currentIds.filter((id) => !visited.has(id));
      if (levelIds.length === 0) break;
      levelIds.forEach((id) => visited.add(id));
      const departments = await this.prisma.department.findMany({
        where: { id: { in: levelIds }, status: 'Active' },
        select: {
          id: true,
          parentId: true,
          permissionGrants: {
            where: { permission: { deprecatedAt: null } },
            select: {
              effect: true,
              permission: { select: { permissionCode: true } },
            },
          },
        },
      });

      const sameLevel = new Map<string, PermissionEffect>();
      for (const department of departments) {
        for (const grant of department.permissionGrants) {
          const code = grant.permission.permissionCode;
          const existing = sameLevel.get(code);
          if (existing !== PermissionEffect.DENY) sameLevel.set(code, grant.effect);
        }
      }
      for (const [code, effect] of sameLevel) {
        this.applyDecision(decisions, code, effect, 2 + depth);
      }
      currentIds = departments
        .map(({ parentId }) => parentId)
        .filter((id): id is string => Boolean(id));
      depth += 1;
    }

    for (const code of SYSTEM_MINIMUM_PERMISSIONS) {
      this.applyDecision(decisions, code, PermissionEffect.ALLOW, 10_000);
    }

    const permissions = [...decisions.entries()]
      .filter(([, decision]) => decision.effect === PermissionEffect.ALLOW)
      .map(([code]) => code)
      .sort();
    return { roles, permissions };
  }

  private applyDecision(
    decisions: Map<string, PermissionDecision>,
    code: string,
    effect: PermissionEffect,
    priority: number,
  ): void {
    const existing = decisions.get(code);
    if (!existing || priority < existing.priority) {
      decisions.set(code, { effect, priority });
      return;
    }
    if (priority === existing.priority && effect === PermissionEffect.DENY) {
      decisions.set(code, { effect, priority });
    }
  }
}
