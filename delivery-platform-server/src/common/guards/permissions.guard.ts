import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuditRecoveryService } from '../../modules/operation-log/audit-recovery.service';
import { OperationLogService } from '../../modules/operation-log/operation-log.service';
import {
  PERMISSIONS_KEY,
  type PermissionRequirement,
} from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly operationLog: OperationLogService,
    @Optional() private readonly auditRecovery?: AuditRecoveryService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<PermissionRequirement>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!metadata) return true;

    const all = metadata.all ?? [];
    const any = metadata.any ?? [];
    if (all.length === 0 && any.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const { user } = request;
    if (!user) throw new ForbiddenException('未登录');

    const userPermissions: string[] = user.permissions ?? [];
    const userRoles: string[] = user.roles ?? [];
    if (userRoles.includes('SUPER_ADMIN')) return true;

    const hasAll = all.every((permission) => userPermissions.includes(permission));
    const hasAny =
      any.length === 0 ||
      any.some((permission) => userPermissions.includes(permission));
    if (hasAll && hasAny) return true;

    const audit = {
      userId: user.sub,
      module: 'permission',
      action: 'deny',
      targetType: 'http_route',
      targetId: `${request.method ?? 'UNKNOWN'} ${request.path ?? 'unknown'}`,
      result: 'failure',
      afterData: {
        requiredAll: all,
        requiredAny: any,
        path: request.path ?? 'unknown',
      },
      errorReason: '权限校验未通过',
    };
    try {
      await this.operationLog.log(audit);
    } catch (error) {
      await this.auditRecovery?.capture(audit, error);
    }
    throw new ForbiddenException('没有足够的操作权限');
  }
}
