import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PermissionsGuard } from '../permissions.guard';

function createContext(permissions: string[], roles: string[] = []) {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: () => ({ user: { permissions, roles } }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('requires every permission declared in all', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue({ all: ['project:update', 'project:stage:update'] }),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() =>
      guard.canActivate(createContext(['project:update'])),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        createContext(['project:update', 'project:stage:update']),
      ),
    ).toBe(true);
  });

  it('accepts one permission declared in any', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue({ any: ['file_review:act', 'file_review:manage'] }),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(createContext(['file_review:act'])),
    ).toBe(true);
  });

  it('requires both all and any groups when both are present', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({
        all: ['project:update'],
        any: ['project:stage:update', 'project:archive'],
      }),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() =>
      guard.canActivate(createContext(['project:update'])),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        createContext(['project:update', 'project:stage:update']),
      ),
    ).toBe(true);
  });

  it('allows SUPER_ADMIN without the declared permission', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue({ all: ['system_setting:manage'] }),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(createContext([], ['SUPER_ADMIN']))).toBe(true);
  });
});
