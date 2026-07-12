import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import type { ProjectAccessService } from '../../project/project-access.service';
import {
  REVIEW_ACTION_PERMISSION_CODES,
  ReviewerEligibilityService,
} from '../reviewer-eligibility.service';

describe('ReviewerEligibilityService', () => {
  function createService() {
    const prisma = {
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    } as unknown as PrismaService;
    const projectAccess = {
      assertProjectAccess: jest.fn(),
    } as unknown as ProjectAccessService;

    return {
      prisma,
      projectAccess,
      service: new ReviewerEligibilityService(prisma, projectAccess),
    };
  }

  it('requires an active user with file_review:act and project access', async () => {
    const { prisma, projectAccess, service } = createService();
    jest.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'reviewer-1' } as never);
    jest.mocked(projectAccess.assertProjectAccess).mockResolvedValue(undefined);

    await expect(service.isEligible('reviewer-1', 'project-1', 'uploader-1')).resolves.toBe(true);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        deletedAt: null,
        status: 'Active',
        userRoles: {
          some: {
            role: {
              status: 'Active',
              rolePermissions: {
                some: {
                  permission: expect.objectContaining({
                    permissionCode: {
                      in: [...REVIEW_ACTION_PERMISSION_CODES],
                    },
                  }),
                },
              },
            },
          },
        },
      }),
      select: { id: true },
    });
    expect(projectAccess.assertProjectAccess).toHaveBeenCalledWith('project-1', 'reviewer-1');
  });

  it('checks file_review:act but not project access for a not-yet-created project', async () => {
    const { prisma, projectAccess, service } = createService();
    jest.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'reviewer-1' } as never);

    await expect(service.isEligibleUser('reviewer-1', 'creator-1')).resolves.toBe(true);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'reviewer-1',
        deletedAt: null,
        status: 'Active',
        userRoles: {
          some: {
            role: {
              status: 'Active',
              rolePermissions: {
                some: {
                  permission: expect.objectContaining({
                    permissionCode: { in: ['file_review:act'] },
                  }),
                },
              },
            },
          },
        },
      }),
      select: { id: true },
    });
    expect(projectAccess.assertProjectAccess).not.toHaveBeenCalled();
  });

  it('rejects self review before querying user or project access', async () => {
    const { prisma, projectAccess, service } = createService();

    await expect(service.isEligible('uploader-1', 'project-1', 'uploader-1')).resolves.toBe(false);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(projectAccess.assertProjectAccess).not.toHaveBeenCalled();
  });

  it('rejects a permission-qualified reviewer outside the project data scope', async () => {
    const { prisma, projectAccess, service } = createService();
    jest.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'reviewer-1' } as never);
    jest
      .mocked(projectAccess.assertProjectAccess)
      .mockRejectedValue(new NotFoundException('项目不存在'));

    await expect(service.isEligible('reviewer-1', 'project-1', 'uploader-1')).resolves.toBe(false);
  });

  it('resolves the responsible user when the explicit reviewer is ineligible', async () => {
    const { service } = createService();
    jest
      .spyOn(service, 'isEligible')
      .mockImplementation((userId) => Promise.resolve(userId === 'responsible-1'));

    await expect(
      service.resolveReviewer({
        projectId: 'project-1',
        uploaderId: 'uploader-1',
        explicitReviewerId: 'invalid-1',
        responsibleUserId: 'responsible-1',
      }),
    ).resolves.toBe('responsible-1');
  });

  it('falls back to another eligible project reviewer and excludes the uploader', async () => {
    const { service } = createService();
    jest.spyOn(service, 'isEligible').mockResolvedValue(false);
    jest.spyOn(service, 'findEligibleReviewers').mockResolvedValue([
      {
        id: 'fallback-1',
        username: 'fallback',
        realName: '候选审核人',
        departmentName: null,
      },
    ]);

    await expect(
      service.resolveReviewer({
        projectId: 'project-1',
        uploaderId: 'uploader-1',
      }),
    ).resolves.toBe('fallback-1');
    expect(service.findEligibleReviewers).toHaveBeenCalledWith('project-1', 'uploader-1');
  });

  it('fails when a required review has no eligible reviewer', async () => {
    const { service } = createService();
    jest.spyOn(service, 'isEligible').mockResolvedValue(false);
    jest.spyOn(service, 'findEligibleReviewers').mockResolvedValue([]);

    await expect(
      service.resolveReviewer({
        projectId: 'project-1',
        uploaderId: 'uploader-1',
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
