import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const permissions = await this.prisma.permission.findMany({
      where: { deprecatedAt: null },
      select: {
        id: true,
        permissionCode: true,
        permissionName: true,
        resource: true,
        action: true,
        description: true,
        createdAt: true,
      },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });

    // Group by resource
    const groupedMap = new Map<string, typeof permissions>();

    for (const perm of permissions) {
      const existing = groupedMap.get(perm.resource) || [];
      existing.push({
        id: perm.id,
        permissionCode: perm.permissionCode,
        permissionName: perm.permissionName,
        resource: perm.resource,
        action: perm.action,
        description: perm.description,
        createdAt: perm.createdAt,
      });
      groupedMap.set(perm.resource, existing);
    }

    return Array.from(groupedMap.entries()).map(([resource, perms]) => ({
      resource,
      permissions: perms.map((permission) => ({
        ...permission,
        actionGroup: this.resolveActionGroup(permission.action),
      })),
    }));
  }

  private resolveActionGroup(
    action: string,
  ): 'view' | 'download' | 'upload' | 'operate' {
    if (action.includes('download')) return 'download';
    if (action.includes('upload') || action === 'create') return 'upload';
    if (
      action === 'view' ||
      action.includes('preview') ||
      action.startsWith('view_')
    ) {
      return 'view';
    }
    return 'operate';
  }
}
