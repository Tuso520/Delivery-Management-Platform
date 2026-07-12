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

  buildProjectWhere(userId: string): Promise<Prisma.ProjectWhereInput> {
    return this.dataScope.buildProjectWhere(userId);
  }

  assertProjectAccess(projectId: string, userId: string): Promise<void> {
    return this.dataScope.assertProjectAccess(projectId, userId);
  }
}
