import type { PaginatedData } from './api'

export const STANDARD_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'REJECTED',
  'PUBLISHED',
  'ARCHIVED',
] as const

export type StandardStatus = (typeof STANDARD_STATUSES)[number]
export type StandardCategoryDimension = 'DELIVERY_STAGE' | 'MANAGEMENT_DOMAIN'
export type StandardSortField = 'updatedAt' | 'name' | 'effectiveAt' | 'currentVersion'

export const STANDARD_RELATION_TYPES = [
  'SUPPORTING_FORM',
  'SUPPORTING_TEMPLATE',
  'REFERENCES',
  'REPLACES',
  'PRECONDITION',
  'FOLLOW_UP',
] as const

export type StandardRelationType = (typeof STANDARD_RELATION_TYPES)[number]

export interface StandardFileAsset {
  id: string
  originalName: string
  extension: string | null
  mimeType: string
  size: string | number
}

export interface StandardFileVersion {
  id: string
  logicalFileId: string
  version: string
  status: string
  asset: StandardFileAsset
}

export interface StandardVersion {
  id: string
  standardId: string
  version: string
  fileVersionId: string
  fileVersion: StandardFileVersion
  status: StandardStatus
  revision: number
  effectiveAt: string | null
  changeDescription: string | null
  submittedBy: string
  submitter: { id: string; realName: string } | null
  publishedAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Standard {
  id: string
  code: string
  name: string
  type: string
  deliveryStageCode: string | null
  managementDomainCode: string | null
  businessTypeCode: string | null
  countryCodes: string[]
  isEnabled: boolean
  status: StandardStatus
  currentPublishedVersionId?: string | null
  currentPublishedVersion: StandardVersion | null
  displayVersion: StandardVersion | null
  effectiveAt: string | null
  createdBy: string
  updatedBy: string
  creator: { id: string; realName: string } | null
  updater: { id: string; realName: string } | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  versions?: StandardVersion[]
}

export interface StandardSummary {
  total: number
  viewCount: number
  downloadCount: number
  draft: number
  inReview: number
  rejected: number
  published: number
  archived: number
}

export interface StandardCategoryCount {
  code: string
  count: number
}

export interface QueryStandardDto {
  page?: number
  pageSize?: number
  keyword?: string
  type?: string
  deliveryStageCode?: string
  managementDomainCode?: string
  businessTypeCode?: string
  countryCode?: string
  status?: StandardStatus
  isEnabled?: boolean
  sortBy?: StandardSortField
  sortOrder?: 'asc' | 'desc'
}

export interface CreateStandardDto {
  code: string
  name: string
  type: string
  deliveryStageCode: string
  managementDomainCode?: string
  businessTypeCode?: string
  countryCodes?: string[]
  isEnabled?: boolean
  effectiveAt?: string
  version?: string
  fileVersionId: string
  changeDescription?: string
}

export interface UpdateStandardDto {
  code?: string
  name?: string
  type?: string
  deliveryStageCode?: string
  managementDomainCode?: string | null
  businessTypeCode?: string | null
  countryCodes?: string[]
  isEnabled?: boolean
  effectiveAt?: string | null
}

export interface CreateStandardVersionDto {
  revision?: number
  version?: string
  fileVersionId?: string
  effectiveAt?: string | null
  changeDescription?: string
}

export interface StandardRelation {
  id: string
  sourceStandardId: string
  targetStandardId: string
  relationType: StandardRelationType
  createdBy: string
  createdAt: string
  targetStandard: Pick<Standard, 'id' | 'code' | 'name' | 'type' | 'status'>
}

export interface ReviewSubmissionResult {
  id: string
  status: string
}

export interface StandardDraftFileUploadResult {
  logicalFileId: string
  fileVersionId: string
  fileName: string
  extension: string | null
  mimeType: string
  size: string | number
  status: 'DRAFT'
}

export type StandardPage = PaginatedData<Standard>
