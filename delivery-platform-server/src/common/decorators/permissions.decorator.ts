import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

export interface PermissionRequirement {
  all?: string[];
  any?: string[];
}

export const RequirePermissions = (requirement: PermissionRequirement) =>
  SetMetadata(PERMISSIONS_KEY, requirement);
