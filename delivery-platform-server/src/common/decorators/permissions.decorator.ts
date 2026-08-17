import { SetMetadata } from '@nestjs/common';

import type {
  PermissionCode,
  RoleCode,
} from '../../modules/permission/access-control.generated';

export const PERMISSIONS_KEY = 'permissions';

export interface PermissionRequirement {
  all?: PermissionCode[];
  any?: PermissionCode[];
  roles?: RoleCode[];
}

export const RequirePermissions = (requirement: PermissionRequirement) =>
  SetMetadata(PERMISSIONS_KEY, requirement);
