import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

import type { JwtPayload } from '../../modules/auth/strategies/jwt.strategy';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * Override handleRequest to validate JWT payload shape.
   * Note: The base AuthGuard signature uses generics (TUser = any), so the
   * `user` parameter is typed as the intersection of JwtPayload + Nest's
   * internal passport types to stay compatible with the base class.
   */
  handleRequest<TUser = JwtPayload>(
    err: Error | null,
    user: JwtPayload | false,
    _info: unknown,
    _context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('未登录或Token已过期');
    }
    return user as unknown as TUser;
  }
}
