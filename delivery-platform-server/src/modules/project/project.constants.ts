export const PROJECT_LIFECYCLE_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
] as const;

export type ProjectLifecycleStatus = (typeof PROJECT_LIFECYCLE_STATUSES)[number];

export type ProjectDeliveryStage = string;

export const PROJECT_SCOPES = ['mine', 'all', 'archived'] as const;
export type ProjectScope = (typeof PROJECT_SCOPES)[number];
