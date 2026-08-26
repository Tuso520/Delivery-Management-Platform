import type { PrismaService } from '../../../database/prisma.service';
import type { OperationLogService } from '../../operation-log/operation-log.service';
import { PermissionService } from '../permission.service';

describe('PermissionService active catalog', () => {
  it('never exposes deprecated permissions to role configuration', async () => {
    const prisma = {
      permission: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const operationLog = { log: jest.fn() } as unknown as OperationLogService;
    const service = new PermissionService(prisma as unknown as PrismaService, operationLog);

    await service.findAll();

    expect(prisma.permission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deprecatedAt: null } }),
    );
  });

  it('marks system-administrator-only permissions in the grouped catalog', async () => {
    const permission = {
      id: 'permission-1',
      permissionCode: 'role:assign_permission',
      permissionName: '分配角色权限',
      resource: 'role',
      action: 'assign_permission',
      moduleCode: 'settings',
      moduleName: '系统设置',
      pageCode: 'role',
      pageName: '角色权限',
      actionGroup: 'OPERATE',
      sortOrder: 1,
      description: null,
      createdAt: new Date('2026-01-01'),
    };
    const prisma = {
      permission: { findMany: jest.fn().mockResolvedValue([permission]) },
    };
    const operationLog = { log: jest.fn() } as unknown as OperationLogService;
    const service = new PermissionService(prisma as unknown as PrismaService, operationLog);

    const result = await service.findAll();

    expect(result[0]?.pages[0]?.permissions[0]).toEqual({
      ...permission,
      restrictedToSystemAdministrator: true,
    });
  });
});
