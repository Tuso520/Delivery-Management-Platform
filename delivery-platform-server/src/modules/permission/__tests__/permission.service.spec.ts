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
});
