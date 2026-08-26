import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import type { OperationLogService } from '../../operation-log/operation-log.service';
import { RoleService } from '../role.service';

describe('RoleService authorization invalidation', () => {
  let transaction: {
    role: { findUnique: jest.Mock; update: jest.Mock };
    permission: { findMany: jest.Mock };
    rolePermission: { deleteMany: jest.Mock; createMany: jest.Mock };
    user: { updateMany: jest.Mock };
  };
  let prisma: {
    role: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let operationLog: { log: jest.Mock };
  let service: RoleService;

  const roleDetail = {
    id: 'role-1',
    roleCode: 'PROJECT_MANAGER',
    roleName: '项目经理',
    description: null,
    status: 'Active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    rolePermissions: [],
  };

  beforeEach(() => {
    transaction = {
      role: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      permission: {
        findMany: jest.fn(),
      },
      rolePermission: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      user: {
        updateMany: jest.fn(),
      },
    };
    prisma = {
      role: {
        findUnique: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    };
    operationLog = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    service = new RoleService(
      prisma as unknown as PrismaService,
      operationLog as unknown as OperationLogService,
    );
  });

  describe('assignPermissions', () => {
    it('replaces permissions and increments affected users in one transaction', async () => {
      transaction.role.findUnique.mockResolvedValue({
        id: 'role-1',
        roleCode: 'PROJECT_MANAGER',
        rolePermissions: [{ permissionId: 'permission-old' }],
      });
      transaction.permission.findMany.mockResolvedValue([
        { id: 'permission-1', permissionCode: 'project:view' },
      ]);
      prisma.role.findUnique.mockResolvedValue(roleDetail);

      await service.assignPermissions('role-1', { permissionIds: ['permission-1'] }, 'admin-1');

      expect(transaction.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: {
          roleId: 'role-1',
          permissionId: { in: ['permission-old'] },
        },
      });
      expect(transaction.permission.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['permission-1'] },
          deprecatedAt: null,
        },
        select: { id: true, permissionCode: true },
      });
      expect(transaction.rolePermission.createMany).toHaveBeenCalledWith({
        data: [{ roleId: 'role-1', permissionId: 'permission-1' }],
      });
      expect(transaction.user.updateMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          userRoles: { some: { roleId: 'role-1' } },
        },
        data: { permissionVersion: { increment: 1 } },
      });
      expect(operationLog.log).toHaveBeenCalledWith(
        {
          userId: 'admin-1',
          module: 'permission',
          action: 'assign_role_permissions',
          targetType: 'role',
          targetId: 'role-1',
          beforeData: { permissionIds: ['permission-old'] },
          afterData: { permissionIds: ['permission-1'] },
        },
        transaction,
      );
    });

    it('does not invalidate sessions when the permission set is unchanged', async () => {
      transaction.role.findUnique.mockResolvedValue({
        id: 'role-1',
        roleCode: 'PROJECT_MANAGER',
        rolePermissions: [{ permissionId: 'permission-1' }, { permissionId: 'permission-2' }],
      });
      transaction.permission.findMany.mockResolvedValue([
        { id: 'permission-1', permissionCode: 'project:view' },
        { id: 'permission-2', permissionCode: 'archive:view' },
      ]);
      prisma.role.findUnique.mockResolvedValue(roleDetail);

      await service.assignPermissions(
        'role-1',
        { permissionIds: ['permission-2', 'permission-1'] },
        'admin-1',
      );

      expect(transaction.rolePermission.deleteMany).not.toHaveBeenCalled();
      expect(transaction.rolePermission.createMany).not.toHaveBeenCalled();
      expect(transaction.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects unknown or deprecated permissions before replacing the existing set', async () => {
      transaction.role.findUnique.mockResolvedValue({
        id: 'role-1',
        roleCode: 'PROJECT_MANAGER',
        rolePermissions: [],
      });
      transaction.permission.findMany.mockResolvedValue([]);

      await expect(
        service.assignPermissions('role-1', { permissionIds: ['missing-permission'] }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);

      expect(transaction.rolePermission.deleteMany).not.toHaveBeenCalled();
      expect(operationLog.log).not.toHaveBeenCalled();
    });

    it('rejects duplicate permission ids', async () => {
      await expect(
        service.assignPermissions(
          'role-1',
          { permissionIds: ['permission-1', 'permission-1'] },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects system-administrator permissions for an ordinary role', async () => {
      transaction.role.findUnique.mockResolvedValue({
        id: 'role-1',
        roleCode: 'PROJECT_MANAGER',
        isProtected: false,
        rolePermissions: [],
      });
      transaction.permission.findMany.mockResolvedValue([
        { id: 'permission-admin', permissionCode: 'role:assign_permission' },
      ]);

      await expect(
        service.assignPermissions('role-1', { permissionIds: ['permission-admin'] }, 'admin-1'),
      ).rejects.toThrow('普通角色不能分配系统管理员专属权限');

      expect(transaction.rolePermission.createMany).not.toHaveBeenCalled();
      expect(operationLog.log).not.toHaveBeenCalled();
    });

    it('allows the system administrator role to retain its dedicated permissions', async () => {
      transaction.role.findUnique.mockResolvedValue({
        id: 'role-system-admin',
        roleCode: 'SYSTEM_ADMIN',
        isProtected: false,
        rolePermissions: [],
      });
      transaction.permission.findMany.mockResolvedValue([
        { id: 'permission-admin', permissionCode: 'role:assign_permission' },
      ]);
      prisma.role.findUnique.mockResolvedValue(roleDetail);

      await service.assignPermissions(
        'role-system-admin',
        { permissionIds: ['permission-admin'] },
        'admin-1',
      );

      expect(transaction.rolePermission.createMany).toHaveBeenCalledWith({
        data: [{ roleId: 'role-system-admin', permissionId: 'permission-admin' }],
      });
    });

    it('throws when the role does not exist', async () => {
      transaction.role.findUnique.mockResolvedValue(null);

      await expect(
        service.assignPermissions('missing-role', { permissionIds: [] }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects changes to the protected super administrator permission set', async () => {
      transaction.role.findUnique.mockResolvedValue({
        id: 'role-super',
        isProtected: true,
        rolePermissions: [],
      });

      await expect(
        service.assignPermissions('role-super', { permissionIds: [] }, 'admin-1'),
      ).rejects.toThrow('超级管理员始终拥有全部权限');
      expect(transaction.rolePermission.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('increments affected users when role status changes', async () => {
      transaction.role.findUnique.mockResolvedValue({
        id: 'role-1',
        status: 'Active',
      });
      transaction.role.update.mockResolvedValue({
        ...roleDetail,
        status: 'Inactive',
      });

      const result = await service.update('role-1', { status: 'Inactive' });

      expect(result.status).toBe('Inactive');
      expect(transaction.user.updateMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          userRoles: { some: { roleId: 'role-1' } },
        },
        data: { permissionVersion: { increment: 1 } },
      });
    });

    it('does not increment permission versions for descriptive edits', async () => {
      transaction.role.findUnique.mockResolvedValue({
        id: 'role-1',
        status: 'Active',
      });
      transaction.role.update.mockResolvedValue({
        ...roleDetail,
        roleName: '高级项目经理',
      });

      await service.update('role-1', { roleName: '高级项目经理' });

      expect(transaction.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects unsupported role statuses', async () => {
      await expect(service.update('role-1', { status: 'Disabled' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws when the role does not exist', async () => {
      transaction.role.findUnique.mockResolvedValue(null);

      await expect(service.update('missing-role', { roleName: 'Missing' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('keeps the protected super administrator role active', async () => {
      transaction.role.findUnique.mockResolvedValue({
        id: 'role-super',
        status: 'Active',
        isProtected: true,
      });

      await expect(service.update('role-super', { status: 'Inactive' })).rejects.toThrow(
        '超级管理员角色必须保持启用',
      );
      expect(transaction.role.update).not.toHaveBeenCalled();
    });
  });
});
