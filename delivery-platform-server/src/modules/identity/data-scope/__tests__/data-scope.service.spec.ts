import { NotFoundException } from '@nestjs/common';
import { DataScopeType } from '@prisma/client';

import type { PrismaService } from '../../../../database/prisma.service';
import { DataScopeService } from '../data-scope.service';

describe('DataScopeService', () => {
  function createService() {
    const prisma = {
      userRole: { findMany: jest.fn() },
      user: { findFirst: jest.fn() },
      projectMember: { findMany: jest.fn() },
      project: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    return { prisma, service: new DataScopeService(prisma) };
  }

  it('returns every non-deleted project for ALL scope', async () => {
    const { prisma, service } = createService();
    jest.spyOn(prisma.userRole, 'findMany').mockResolvedValue([
      {
        dataScope: DataScopeType.ALL,
        scopeConfig: null,
      },
    ] as never);

    await expect(service.buildProjectWhere('user-1')).resolves.toEqual({
      deletedAt: null,
    });
  });

  it('combines participated, owned and custom scopes without role checks', async () => {
    const { prisma, service } = createService();
    jest.spyOn(prisma.userRole, 'findMany').mockResolvedValue([
      { dataScope: DataScopeType.PARTICIPATED, scopeConfig: null },
      { dataScope: DataScopeType.OWNED, scopeConfig: null },
      {
        dataScope: DataScopeType.CUSTOM,
        scopeConfig: { projectIds: ['project-2'] },
      },
    ] as never);

    const where = await service.buildProjectWhere('user-1');

    expect(where).toEqual({
      deletedAt: null,
      OR: [
        { members: { some: { userId: 'user-1', deletedAt: null } } },
        {
          OR: [
            { createdBy: 'user-1' },
            { salesOwnerId: 'user-1' },
            { projectManagerId: 'user-1' },
            { electricLeaderId: 'user-1' },
            { softwareLeaderId: 'user-1' },
            { purchaseOwnerId: 'user-1' },
            { financeOwnerId: 'user-1' },
          ],
        },
        { id: { in: ['project-2'] } },
      ],
    });
  });

  it('derives country scope from existing memberships when not configured', async () => {
    const { prisma, service } = createService();
    jest.spyOn(prisma.userRole, 'findMany').mockResolvedValue([
      { dataScope: DataScopeType.COUNTRY, scopeConfig: null },
    ] as never);
    jest.spyOn(prisma.projectMember, 'findMany').mockResolvedValue([
      { project: { countryCode: 'CN' } },
      { project: { countryCode: 'CN' } },
      { project: { countryCode: 'VN' } },
    ] as never);

    await expect(service.buildProjectWhere('user-1')).resolves.toEqual({
      deletedAt: null,
      OR: [{ countryCode: { in: ['CN', 'VN'] } }],
    });
  });

  it('scopes department access to projects involving users in that department', async () => {
    const { prisma, service } = createService();
    jest.spyOn(prisma.userRole, 'findMany').mockResolvedValue([
      { dataScope: DataScopeType.DEPARTMENT, scopeConfig: null },
    ] as never);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({
      departmentId: 'department-1',
    } as never);

    await expect(service.buildProjectWhere('user-1')).resolves.toEqual({
      deletedAt: null,
      OR: [
        {
          members: {
            some: { deletedAt: null, user: { departmentId: 'department-1' } },
          },
        },
      ],
    });
  });

  it('denies every project when the user has no scope assignment', async () => {
    const { prisma, service } = createService();
    jest.spyOn(prisma.userRole, 'findMany').mockResolvedValue([]);

    await expect(service.buildProjectWhere('user-1')).resolves.toEqual({
      deletedAt: null,
      OR: [{ id: { in: [] } }],
    });
  });

  it('uses a scoped lookup and hides inaccessible project existence', async () => {
    const { prisma, service } = createService();
    jest.spyOn(prisma.userRole, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.project, 'findFirst').mockResolvedValue(null);

    await expect(
      service.assertProjectAccess('project-1', 'user-1'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        OR: [{ id: { in: [] } }],
        id: 'project-1',
      },
      select: { id: true },
    });
  });
});
