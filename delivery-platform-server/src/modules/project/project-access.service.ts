import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { DataScopeService } from '../identity/data-scope/data-scope.service';

/**
 * Compatibility facade retained while project consumers migrate to the
 * shared identity data-scope service.
 */
@Injectable()
export class ProjectAccessService {
  constructor(private readonly dataScope: DataScopeService) {}

  buildProjectWhere(
    userId: string,
    roles: readonly string[] = [],
  ): Promise<Prisma.ProjectWhereInput> {
    if (this.isAdministrator(roles)) return Promise.resolve({ deletedAt: null });
    return this.dataScope.buildProjectWhere(userId);
  }

  assertProjectAccess(
    projectId: string,
    userId: string,
    roles: readonly string[] = [],
  ): Promise<void> {
    if (this.isAdministrator(roles)) return Promise.resolve();
    return this.dataScope.assertProjectAccess(projectId, userId);
  }

  private isAdministrator(roles: readonly string[]): boolean {
    return roles.some((role) => role === 'SUPER_ADMIN' || role === 'SYSTEM_ADMIN');
  }
}
