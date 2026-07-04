import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, mergeMap, Observable, of } from 'rxjs';

import type { JwtPayload } from '../../modules/auth/strategies/jwt.strategy';
import { OperationLogService } from '../../modules/operation-log/operation-log.service';

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const sensitiveKeys = new Set([
  'password',
  'oldPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'jwtSecret',
  'apiKey',
  'configValue',
]);

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitiveKeys.has(key) ? '[REDACTED]' : sanitizeValue(item),
      ]),
    );
  }
  return value;
}

function resolveModule(path: string): string {
  const normalized = path.replace(/^\/api\/v1\//, '');
  return normalized.split('/')[0] || 'system';
}

@Injectable()
export class OperationAuditInterceptor implements NestInterceptor {
  constructor(private readonly operationLog: OperationLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      !mutationMethods.has(request.method) ||
      !request.user?.sub ||
      request.path.includes('/operation-logs')
    ) {
      return next.handle();
    }

    return next.handle().pipe(
      mergeMap((response: unknown) =>
        from(
          this.operationLog.log({
            userId: request.user!.sub,
            module: resolveModule(request.path),
            action: request.method.toLowerCase(),
            targetType: resolveModule(request.path),
            targetId:
              String(request.params.id ?? request.params.projectId ?? request.user!.sub),
            afterData: {
              path: request.path,
              body: sanitizeValue(request.body),
            },
            ipAddress: request.ip,
            userAgent: request.get('user-agent'),
            result: 'success',
          }),
        ).pipe(mergeMap(() => of(response))),
      ),
    );
  }
}
