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
        rolePermissions: [{ permissionId: 'permission-old' }],
      });
      transaction.permission.findMany.mockResolvedValue([{ id: 'permission-1' }]);
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
        select: { id: true },
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
        rolePermissions: [{ permissionId: 'permission-1' }, { permissionId: 'permission-2' }],
      });
      transaction.permission.findMany.mockResolvedValue([
        { id: 'permission-1' },
        { id: 'permission-2' },
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

    it('throws when the role does not exist', async () => {
      transaction.role.findUnique.mockResolvedValue(null);

      await expect(
        service.assignPermissions('missing-role', { permissionIds: [] }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
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
  });
});
