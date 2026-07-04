import { ForbiddenException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import { ProjectAccessService } from '../project-access.service';

describe('ProjectAccessService', () => {
  function createService(options?: {
    roles?: string[];
    projectExists?: boolean;
    memberExists?: boolean;
  }) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          userRoles: (options?.roles ?? ['PROJECT_MANAGER']).map((roleCode) => ({
            role: { roleCode },
          })),
        }),
      },
      project: {
        findFirst: jest
          .fn()
          .mockResolvedValue(options?.projectExists === false ? null : { id: 'project-1' }),
      },
      projectMember: {
        findUnique: jest
          .fn()
          .mockResolvedValue(options?.memberExists === false ? null : { id: 'member-1' }),
      },
    } as unknown as PrismaService;

    return { service: new ProjectAccessService(prisma), prisma };
  }

  it('limits a regular user project query to their memberships', async () => {
    const { service } = createService({ roles: ['PROJECT_MANAGER'] });

    await expect(service.buildProjectWhere('user-1')).resolves.toEqual({
      deletedAt: null,
      members: { some: { userId: 'user-1' } },
    });
  });

  it('allows elevated roles to query all active projects', async () => {
    const { service } = createService({ roles: ['DELIVERY_MANAGER'] });

    await expect(service.buildProjectWhere('user-1')).resolves.toEqual({
      deletedAt: null,
    });
  });

  it('rejects a non-member accessing a project', async () => {
    const { service } = createService({ memberExists: false });

    await expect(
      service.assertProjectAccess('project-1', 'user-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns not found before checking membership for a deleted project', async () => {
    const { service, prisma } = createService({ projectExists: false });

    await expect(
      service.assertProjectAccess('project-1', 'user-1'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
  });
});
