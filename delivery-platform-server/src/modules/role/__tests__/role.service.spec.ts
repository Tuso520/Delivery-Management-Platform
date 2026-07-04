import type { PrismaService } from '../../../database/prisma.service';
import type { OperationLogService } from '../../operation-log/operation-log.service';
import { RoleService } from '../role.service';

describe('RoleService permission auditing', () => {
  it('records permission assignment in the operation log', async () => {
    const transaction = {
      rolePermission: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const prisma = {
      role: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'role-1' })
          .mockResolvedValueOnce({
            id: 'role-1',
            rolePermissions: [],
          }),
      },
      $transaction: jest.fn().mockImplementation(
        (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const operationLog = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as OperationLogService;
    const service = new RoleService(prisma, operationLog);

    await service.assignPermissions(
      'role-1',
      { permissionIds: ['permission-1'] },
      'admin-1',
    );

    expect(operationLog.log).toHaveBeenCalledWith({
      userId: 'admin-1',
      module: 'permission',
      action: 'assign_role_permissions',
      targetType: 'role',
      targetId: 'role-1',
      afterData: { permissionIds: ['permission-1'] },
    });
  });
});
