import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { JwtPayload } from '../../modules/auth/strategies/jwt.strategy';

export const CurrentUser = createParamDecorator<
  keyof JwtPayload | undefined,
  JwtPayload | JwtPayload[keyof JwtPayload] | undefined
>(
  (
    data: keyof JwtPayload | undefined,
    ctx: ExecutionContext,
  ): JwtPayload | JwtPayload[keyof JwtPayload] | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const user: JwtPayload = request.user;
    return data ? user?.[data] : user;
  },
);
