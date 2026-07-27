export const PROJECT_LIFECYCLE_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
] as const;

export type ProjectLifecycleStatus = (typeof PROJECT_LIFECYCLE_STATUSES)[number];

export type ProjectDeliveryStage = string;

export const PROJECT_SUMMARY_FILTERS = [
  'ALL',
  'ACTIVE',
  'ACCEPTED',
  'ACCEPTED_THIS_YEAR',
  'HIGH_RISK',
] as const;

export type ProjectSummaryFilter = (typeof PROJECT_SUMMARY_FILTERS)[number];

export const PROJECT_SCOPES = ['mine', 'all'] as const;
export type ProjectScope = (typeof PROJECT_SCOPES)[number];
