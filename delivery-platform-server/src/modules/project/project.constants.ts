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

export const PROJECT_SCOPES = ['mine', 'all'] as const;
export type ProjectScope = (typeof PROJECT_SCOPES)[number];

export const PROJECT_TYPES = [
  'FACTORY',
  'DATA_CENTER',
  'COMMERCIAL',
  'MEDICAL',
  'RAIL_TRANSIT',
  'LIGHTWEIGHT',
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const CONTRACT_TYPES = ['EPC', 'EMC', 'POC'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const PRODUCT_TYPES = ['DEEPSIGHT', 'DEEPBOT'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PROJECT_KEYWORDS = [
  'NEW_BUILD',
  'RENOVATION',
  'MAIN_MATERIAL',
  'CONSTRUCTION',
  'SOFTWARE_COMMISSIONING',
  'HARDWARE_COMMISSIONING',
  'CHILLER_ENERGY_SAVING',
  'HVAC_ENERGY_SAVING',
  'AIR_COMPRESSOR_ENERGY_SAVING',
  'EMCS_SYSTEM',
  'ENERGY_MANAGEMENT_SYSTEM',
  'SOFTWARE_SYSTEM',
  'CHILLER_PLANT_CONTROL',
  'HIGH_EFFICIENCY_PLANT_ROOM',
  'PLATFORM_CUSTOMIZATION',
  'RESEARCH',
] as const;
export type ProjectKeyword = (typeof PROJECT_KEYWORDS)[number];
