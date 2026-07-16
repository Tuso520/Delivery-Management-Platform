export const PROJECT_LIFECYCLE_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
] as const

export type ProjectLifecycleStatus = (typeof PROJECT_LIFECYCLE_STATUSES)[number]

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
] as const

export type ProjectDeliveryStage = (typeof PROJECT_DELIVERY_STAGES)[number]

export const PROJECT_SUMMARY_FILTERS = ['ALL', 'ACTIVE', 'ACCEPTED', 'HIGH_RISK'] as const

export type ProjectSummaryFilter = (typeof PROJECT_SUMMARY_FILTERS)[number]

export type ProjectSort =
  | 'updatedAt:desc'
  | 'updatedAt:asc'
  | 'projectName:asc'
  | 'projectName:desc'

export type AcceptanceTimeType = 'ACTUAL' | 'EXPECTED' | 'NONE'
export type ProjectScope = 'mine' | 'all'
export type ProjectType = string
export type ContractType = string
export type ProductType = string
export type ProjectKeyword = string

export interface ProjectConfigurationOption {
  value: string
  label: string
  extraData: unknown
}

export interface ProjectConfiguration {
  projectTypes: ProjectConfigurationOption[]
  contractTypes: ProjectConfigurationOption[]
  productTypes: ProjectConfigurationOption[]
  projectKeywords: ProjectConfigurationOption[]
}

export interface Project {
  id: string
  revision: number
  projectCode: string
  projectName: string
  name: string
  shortName?: string | null
  countryCode: string
  countryName?: string | null
  city?: string | null
  cityName?: string | null
  customerName?: string | null
  projectType?: ProjectType | null
  contractType?: ContractType | null
  product?: ProductType | null
  keywords: ProjectKeyword[]
  contractCurrency?: string | null
  baseCurrency?: string | null
  contractAmount?: number | null
  exchangeRate?: number | null
  convertedAmount?: number | null
  convertedCnyAmount?: number | null
  currencyCode?: string | null
  exchangeRateDate?: string | null
  exchangeRateSource?: string | null
  contractNo?: string | null
  contractSignedAt?: string | null
  projectLanguage?: string | null
  salesOwnerId?: string | null
  projectManagerId?: string | null
  electricalOwnerId?: string | null
  softwareOwnerId?: string | null
  currentStage: ProjectDeliveryStage
  status: ProjectLifecycleStatus
  progressPercent?: number | null
  riskLevel: string
  riskDescription?: string | null
  startDate?: string
  plannedEndDate?: string
  actualEndDate?: string
  expectedAcceptanceAt?: string | null
  actualAcceptanceAt?: string | null
  acceptanceTimeType?: AcceptanceTimeType
  archivedAt?: string | null
  archiveTemplateId?: string | null
  archiveTemplateVersionId?: string | null
  archivedBy?: string | null
  archivedByUser?: ProjectUserSummary | null
  createdBy?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
  members?: ProjectMember[]
  salesOwner?: ProjectUserSummary | null
  projectManager?: ProjectUserSummary | null
  canEdit: boolean
  canUpdateProgress: boolean
  canArchive: boolean
  canRestore: boolean
  canPermanentDelete: boolean
  archiveCompletion?: {
    total: number
    completed: number
    requiredTotal: number
    requiredCompleted: number
  }
  recentActivities?: Array<{
    id: string
    title: string
    description?: string | null
    stageCode?: string | null
    recordDate: string
    createdBy: string
  }>
}

export interface ProjectUserSummary {
  id: string
  username: string
  realName: string
}

export interface ProjectMember {
  id: string
  projectId?: string
  userId: string
  projectRole: string
  permissionLevel?: string
  dataScope?: string
  createdAt?: string
  updatedAt?: string
  user?: {
    id: string
    username: string
    realName: string
    email?: string
  }
}

export interface ProjectSummary {
  total: number
  active: number
  accepted: number
  highRisk: number
}

export type ProjectUserReferencePurpose = 'project-member' | 'project-manager' | 'sales-owner'

export interface ProjectUserReferenceOption {
  id: string
  name: string
  displayName: string
  departmentName: string | null
  active: boolean
}

interface ProjectCommonWriteFields {
  projectName?: string
  shortName?: string
  countryCode?: string
  city?: string
  customerName?: string
  projectType?: ProjectType
  contractType?: ContractType
  product?: ProductType
  keywords?: ProjectKeyword[]
  contractCurrency?: string
  baseCurrency?: string
  contractAmount?: number
  contractNo?: string
  contractSignedAt?: string
  projectLanguage?: string
  salesOwnerId?: string
  projectManagerId?: string
  electricalOwnerId?: string
  softwareOwnerId?: string
  riskLevel?: string
  riskDescription?: string
  startDate?: string
  plannedEndDate?: string
}

export interface CreateProjectDto extends ProjectCommonWriteFields {
  projectName: string
  countryCode: string
  archiveTemplateId: string
  deliveryStage?: ProjectDeliveryStage
  progressPercent?: number
  expectedAcceptanceAt?: string
  archiveTemplateVersionId?: string
  approvalTemplateId?: string
  saveAsDraft?: boolean
}

/**
 * Ordinary editable fields. Stage, status, and acceptance data use dedicated commands.
 */
export interface UpdateProjectDto extends ProjectCommonWriteFields {
  revision: number
}

export interface QueryProjectDto {
  page: number
  pageSize: number
  keyword?: string
  scope?: ProjectScope
  summaryFilter?: ProjectSummaryFilter
  sort?: ProjectSort
}

export interface UpdateProjectProgressDto {
  revision: number
  targetStage: ProjectDeliveryStage
  progressPercent: number
  expectedAcceptanceAt?: string
  actualAcceptanceAt?: string
  reason?: string
}

export interface ProjectStatusActionDto {
  revision: number
  reason?: string
}

export type ProjectStatusCommand =
  | 'pause'
  | 'resume'
  | 'complete'
  | 'cancel'
  | 'archive'
  | 'restore'

export const PROJECT_STATUS_OPTIONS: ReadonlyArray<{
  value: ProjectLifecycleStatus
  label: string
}> = [
  { value: 'DRAFT', label: 'status.DRAFT' },
  { value: 'ACTIVE', label: 'status.ACTIVE' },
  { value: 'PAUSED', label: 'status.PAUSED' },
  { value: 'COMPLETED', label: 'status.COMPLETED' },
  { value: 'CANCELLED', label: 'status.CANCELLED' },
]

export const RISK_LEVEL_OPTIONS = [
  { value: 'Low', label: 'risk.Low' },
  { value: 'Medium', label: 'risk.Medium' },
  { value: 'High', label: 'risk.High' },
  { value: 'Critical', label: 'risk.Critical' },
]

export const STAGE_OPTIONS: ReadonlyArray<{
  value: ProjectDeliveryStage
  label: string
}> = [
  { value: 'STARTUP', label: 'stage.STARTUP' },
  { value: 'DEEPENING', label: 'stage.DEEPENING' },
  { value: 'PROCUREMENT', label: 'stage.PROCUREMENT' },
  { value: 'CONSTRUCTION', label: 'stage.CONSTRUCTION' },
  { value: 'COMMISSIONING', label: 'stage.COMMISSIONING' },
  { value: 'TESTING', label: 'stage.TESTING' },
  { value: 'INTERNAL_ACCEPTANCE', label: 'stage.INTERNAL_ACCEPTANCE' },
  { value: 'EXTERNAL_ACCEPTANCE', label: 'stage.EXTERNAL_ACCEPTANCE' },
  { value: 'WARRANTY', label: 'stage.WARRANTY' },
]

export const PROJECT_ROLE_OPTIONS = [
  { value: 'SALES_OWNER', label: 'projects.roles.SALES_OWNER' },
  { value: 'PROJECT_MANAGER', label: 'projects.roles.PROJECT_MANAGER' },
  { value: 'DELIVERY_MANAGER', label: 'projects.roles.DELIVERY_MANAGER' },
  { value: 'COUNTRY_MANAGER', label: 'projects.roles.COUNTRY_MANAGER' },
  { value: 'ELEC_LEADER', label: 'projects.roles.ELEC_LEADER' },
  { value: 'ELEC_ENGINEER', label: 'projects.roles.ELEC_ENGINEER' },
  { value: 'SOFTWARE_LEADER', label: 'projects.roles.SOFTWARE_LEADER' },
  { value: 'SOFTWARE_ENGINEER', label: 'projects.roles.SOFTWARE_ENGINEER' },
  { value: 'PURCHASE', label: 'projects.roles.PURCHASE' },
  { value: 'FINANCE', label: 'projects.roles.FINANCE' },
  { value: 'HSE', label: 'projects.roles.HSE' },
  { value: 'QUALITY_MANAGER', label: 'projects.roles.QUALITY_MANAGER' },
  { value: 'MEMBER', label: 'projects.roles.MEMBER' },
]
