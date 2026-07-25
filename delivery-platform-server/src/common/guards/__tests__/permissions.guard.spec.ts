import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { OperationLogService } from '../../../modules/operation-log/operation-log.service';
import { PermissionsGuard } from '../permissions.guard';

function createContext(permissions: string[], roles: string[] = []) {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: () => ({
        method: 'POST',
        path: '/api/v1/projects/project-1/archive',
        user: { sub: 'user-1', permissions, roles },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const operationLog = {
    log: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  } as unknown as OperationLogService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires every permission declared in all', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue({ all: ['project:update', 'project:progress:update'] }),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, operationLog);

    await expect(
      guard.canActivate(createContext(['project:update'])),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      guard.canActivate(
        createContext(['project:update', 'project:progress:update']),
      ),
    ).resolves.toBe(true);
    expect(operationLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'deny',
        result: 'failure',
      }),
    );
  });

  it('accepts one permission declared in any', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue({ any: ['file_review:act', 'file_review:manage'] }),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, operationLog);

    await expect(
      guard.canActivate(createContext(['file_review:act'])),
    ).resolves.toBe(true);
  });

  it('requires both all and any groups when both are present', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({
        all: ['project:update'],
        any: ['project:progress:update', 'project:archive'],
      }),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, operationLog);

    await expect(
      guard.canActivate(createContext(['project:update'])),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      guard.canActivate(
        createContext(['project:update', 'project:progress:update']),
      ),
    ).resolves.toBe(true);
  });

  it('allows SUPER_ADMIN without the declared permission', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue({ all: ['system_setting:manage'] }),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, operationLog);

    await expect(guard.canActivate(createContext([], ['SUPER_ADMIN']))).resolves.toBe(true);
  });

  it('keeps the 403 decision when deny auditing fails and records compensation', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({ all: ['project:delete'] }),
    } as unknown as Reflector;
    const auditError = new Error('audit unavailable');
    const failingLog = {
      log: jest.fn().mockRejectedValue(auditError),
    } as unknown as OperationLogService;
    const capture = jest.fn().mockResolvedValue(undefined);
    const guard = new PermissionsGuard(reflector, failingLog, { capture } as never);

    await expect(guard.canActivate(createContext([]))).rejects.toThrow(ForbiddenException);
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failure',
        targetId: 'POST /api/v1/projects/project-1/archive',
      }),
      auditError,
    );
  });
});
