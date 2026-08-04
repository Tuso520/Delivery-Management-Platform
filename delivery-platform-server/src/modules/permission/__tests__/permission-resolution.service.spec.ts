import { NotFoundException } from '@nestjs/common';
import { PermissionEffect } from '@prisma/client';

import type { PrismaService } from '../../../database/prisma.service';
import { PermissionResolutionService } from '../permission-resolution.service';

describe('PermissionResolutionService', () => {
  function createService(input: {
    user: Record<string, unknown> | null;
    departmentLevels?: Array<Array<Record<string, unknown>>>;
  }) {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(input.user) },
      department: {
        findMany: jest
          .fn()
          .mockImplementation(() => Promise.resolve(input.departmentLevels?.shift() ?? [])),
      },
    };
    return {
      prisma,
      service: new PermissionResolutionService(prisma as unknown as PrismaService),
    };
  }

  it('applies user override, role, own department and ancestor in strict priority order', async () => {
    const { service } = createService({
      user: {
        departmentId: 'department-child',
        departmentMemberships: [],
        permissionOverrides: [
          {
            effect: PermissionEffect.DENY,
            permission: { permissionCode: 'project:edit' },
          },
        ],
        userRoles: [
          {
            role: {
              roleCode: 'PROJECT_MEMBER',
              rolePermissions: [
                { permission: { permissionCode: 'project:edit' } },
                { permission: { permissionCode: 'file:download' } },
              ],
            },
          },
        ],
      },
      departmentLevels: [
        [
          {
            id: 'department-child',
            parentId: 'department-parent',
            permissionGrants: [
              {
                effect: PermissionEffect.DENY,
                permission: { permissionCode: 'file:download' },
              },
              {
                effect: PermissionEffect.ALLOW,
                permission: { permissionCode: 'archive:view' },
              },
            ],
          },
        ],
        [
          {
            id: 'department-parent',
            parentId: null,
            permissionGrants: [
              {
                effect: PermissionEffect.DENY,
                permission: { permissionCode: 'archive:view' },
              },
              {
                effect: PermissionEffect.ALLOW,
                permission: { permissionCode: 'knowledge:view' },
              },
            ],
          },
        ],
      ],
    });

    await expect(service.resolveForUser('user-1')).resolves.toEqual({
      roles: ['PROJECT_MEMBER'],
      permissions: ['archive:view', 'dashboard:view', 'file:download', 'knowledge:view'],
    });
  });

  it('lets deny win when multiple memberships grant opposite effects at the same depth', async () => {
    const { service } = createService({
      user: {
        departmentId: null,
        departmentMemberships: [
          { departmentId: 'department-a' },
          { departmentId: 'department-b' },
        ],
        permissionOverrides: [],
        userRoles: [],
      },
      departmentLevels: [
        [
          {
            id: 'department-a',
            parentId: null,
            permissionGrants: [
              {
                effect: PermissionEffect.ALLOW,
                permission: { permissionCode: 'standard:view' },
              },
            ],
          },
          {
            id: 'department-b',
            parentId: null,
            permissionGrants: [
              {
                effect: PermissionEffect.DENY,
                permission: { permissionCode: 'standard:view' },
              },
            ],
          },
        ],
      ],
    });

    await expect(service.resolveForUser('user-1')).resolves.toEqual({
      roles: [],
      permissions: ['dashboard:view'],
    });
  });

  it('fails closed for an inactive or missing user', async () => {
    const { service } = createService({ user: null });

    await expect(service.resolveForUser('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
