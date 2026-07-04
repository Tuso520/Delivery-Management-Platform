import type { PaginationParams } from './api'

export interface ChecklistTemplate {
  id: string
  templateCode: string
  templateName: string
  countryCode?: string
  projectType?: string
  stageCode?: string
  version: string
  status: string
  createdAt: string
  updatedAt: string
  itemCount?: number
  items?: ChecklistTemplateItem[]
}

export interface ChecklistTemplateItem {
  id: string
  templateId: string
  itemName: string
  itemDescription?: string
  checkStandard?: string
  evidenceRequired?: string
  evidenceTypes: string
  minEvidenceCount: number
  allowAlbum: boolean
  requireLocation: boolean
  relatedArchiveTemplateItemId?: string
  isRequired: boolean
  riskLevel: string
  responsibleRole?: string
  reviewRole?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CreateChecklistTemplateParams {
  templateCode: string
  templateName: string
  countryCode?: string
  projectType?: string
  stageCode?: string
  version?: string
}

export interface UpdateChecklistTemplateParams {
  templateName?: string
  countryCode?: string
  projectType?: string
  stageCode?: string
  version?: string
  status?: string
}

export interface CreateChecklistTemplateItemParams {
  itemName: string
  itemDescription?: string
  checkStandard?: string
  evidenceRequired?: string
  evidenceTypes?: string[]
  minEvidenceCount?: number
  allowAlbum?: boolean
  requireLocation?: boolean
  relatedArchiveTemplateItemId?: string
  isRequired?: boolean
  riskLevel?: string
  responsibleRole?: string
  reviewRole?: string
  sortOrder?: number
}

export interface UpdateChecklistTemplateItemParams {
  itemName?: string
  itemDescription?: string
  checkStandard?: string
  evidenceRequired?: string
  evidenceTypes?: string[]
  minEvidenceCount?: number
  allowAlbum?: boolean
  requireLocation?: boolean
  relatedArchiveTemplateItemId?: string
  isRequired?: boolean
  riskLevel?: string
  responsibleRole?: string
  reviewRole?: string
  sortOrder?: number
}

export interface ReorderItemsParams {
  itemIds: string[]
}

export interface QueryChecklistTemplateParams extends PaginationParams {
  keyword?: string
  countryCode?: string
  projectType?: string
  status?: string
}
