import type { PrismaService } from '../../../database/prisma.service';
import { ReferenceService } from '../reference.service';

describe('ReferenceService selectable options', () => {
  it('returns active roles as lightweight selector options', async () => {
    const prisma = {
      role: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'role-1',
            roleCode: 'PROJECT_MANAGER',
            roleName: '项目经理',
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new ReferenceService(prisma);

    await expect(service.findRoleOptions()).resolves.toEqual([
      {
        id: 'role-1',
        roleCode: 'PROJECT_MANAGER',
        roleName: '项目经理',
      },
    ]);
    expect(prisma.role.findMany).toHaveBeenCalledWith({
      where: { status: 'Active' },
      select: { id: true, roleCode: true, roleName: true },
      orderBy: { roleName: 'asc' },
    });
  });
});
