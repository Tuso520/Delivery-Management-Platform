export const PROJECT_LIFECYCLE_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
] as const;

export type ProjectLifecycleStatus = (typeof PROJECT_LIFECYCLE_STATUSES)[number];

export const PROJECT_DELIVERY_STAGES = [
  'STARTUP',
  'DEEPENING',
  'PROCUREMENT',
  'CONSTRUCTION',
  'COMMISSIONING',
  'TESTING',
  'INTERNAL_ACCEPTANCE',
  'EXTERNAL_ACCEPTANCE',
  'WARRANTY',
] as const;

export type ProjectDeliveryStage = (typeof PROJECT_DELIVERY_STAGES)[number];

export const PROJECT_SUMMARY_FILTERS = ['ALL', 'ACTIVE', 'ACCEPTED', 'HIGH_RISK'] as const;

export type ProjectSummaryFilter = (typeof PROJECT_SUMMARY_FILTERS)[number];
