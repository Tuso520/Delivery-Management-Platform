import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RolesGuard } from '../roles.guard';

describe('RolesGuard', () => {
  it('allows SUPER_ADMIN to access role-restricted endpoints', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['PROJECT_MANAGER']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ user: { roles: ['SUPER_ADMIN'] } }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });
});
