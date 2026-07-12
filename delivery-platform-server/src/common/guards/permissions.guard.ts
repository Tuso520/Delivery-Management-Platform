import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  PERMISSIONS_KEY,
  type PermissionRequirement,
} from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const metadata = this.reflector.getAllAndOverride<
      PermissionRequirement | string[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!metadata) {
      return true;
    }

    const requirement: PermissionRequirement = Array.isArray(metadata)
      ? { any: metadata }
      : metadata;
    const all = requirement.all ?? [];
    const any = requirement.any ?? [];
    if (all.length === 0 && any.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('未登录');
    }

    const userPermissions: string[] = user.permissions || [];
    const userRoles: string[] = user.roles || [];

    if (userRoles.includes('SUPER_ADMIN')) {
      return true;
    }

    const hasAll = all.every((permission) =>
      userPermissions.includes(permission),
    );
    const hasAny =
      any.length === 0 ||
      any.some((permission) => userPermissions.includes(permission));

    if (!hasAll || !hasAny) {
      throw new ForbiddenException('没有足够的操作权限');
    }

    return true;
  }
}
