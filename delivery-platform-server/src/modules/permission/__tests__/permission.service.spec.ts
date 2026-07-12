import type { PrismaService } from '../../../database/prisma.service';
import { PermissionService } from '../permission.service';

describe('PermissionService active catalog', () => {
  it('never exposes deprecated permissions to role configuration', async () => {
    const prisma = {
      permission: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new PermissionService(prisma as unknown as PrismaService);

    await service.findAll();

    expect(prisma.permission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deprecatedAt: null } }),
    );
  });
});
