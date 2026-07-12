import type { PrismaService } from '../../../database/prisma.service';
import type { ReviewerEligibilityService } from '../../review/reviewer-eligibility.service';
import { ReferenceService } from '../reference.service';

describe('ReferenceService selectable options', () => {
  function createService() {
    const prisma = {
      role: { findMany: jest.fn() },
      user: { findMany: jest.fn() },
    } as unknown as PrismaService;
    const reviewerEligibility = {
      findEligibleReviewers: jest.fn(),
    } as unknown as ReviewerEligibilityService;

    return {
      prisma,
      reviewerEligibility,
      service: new ReferenceService(prisma, reviewerEligibility),
    };
  }

  it('returns active roles as lightweight selector options', async () => {
    const { prisma, service } = createService();
    jest.mocked(prisma.role.findMany).mockResolvedValue([
      {
        id: 'role-1',
        roleCode: 'PROJECT_MANAGER',
        roleName: '项目经理',
      },
    ] as never);

    await expect(
      service.findRoleOptions('notification-recipient'),
    ).resolves.toEqual([
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

  it('returns only minimal active user fields for project members', async () => {
    const { prisma, service } = createService();
    jest.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'user-1',
        username: 'engineer',
        realName: '工程师',
        department: { departmentName: '软件部' },
      },
    ] as never);

    await expect(service.findUserOptions('project-member')).resolves.toEqual([
      {
        id: 'user-1',
        name: 'engineer',
        displayName: '工程师',
        departmentName: '软件部',
        active: true,
      },
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, status: 'Active' },
        select: {
          id: true,
          username: true,
          realName: true,
          department: { select: { departmentName: true } },
        },
      }),
    );
  });

  it('filters project-manager options by active role', async () => {
    const { prisma, service } = createService();
    jest.mocked(prisma.user.findMany).mockResolvedValue([]);

    await service.findUserOptions('project-manager');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userRoles: {
            some: {
              role: {
                status: 'Active',
                roleCode: { in: ['PROJECT_MANAGER'] },
              },
            },
          },
        }),
      }),
    );
  });

  it('filters sales-owner options to delivery and country managers', async () => {
    const { prisma, service } = createService();
    jest.mocked(prisma.user.findMany).mockResolvedValue([]);

    await service.findUserOptions('sales-owner');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userRoles: {
            some: {
              role: {
                status: 'Active',
                roleCode: {
                  in: ['DELIVERY_MANAGER', 'COUNTRY_MANAGER'],
                },
              },
            },
          },
        }),
      }),
    );
  });

  it('delegates file-reviewer filtering to the shared eligibility service', async () => {
    const { prisma, reviewerEligibility, service } = createService();
    jest.mocked(reviewerEligibility.findEligibleReviewers).mockResolvedValue([
      {
        id: 'reviewer-1',
        username: 'reviewer',
        realName: '审核人',
        departmentName: null,
      },
    ]);

    await expect(service.findUserOptions('file-reviewer', 'project-1')).resolves.toEqual([
      {
        id: 'reviewer-1',
        name: 'reviewer',
        displayName: '审核人',
        departmentName: null,
        active: true,
      },
    ]);
    expect(reviewerEligibility.findEligibleReviewers).toHaveBeenCalledWith('project-1');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
