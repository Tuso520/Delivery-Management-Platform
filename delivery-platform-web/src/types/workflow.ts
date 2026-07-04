import type { PaginationParams } from './api'

export interface WorkflowCategory {
  id: string
  name: string
  description?: string
  sortOrder: number
  status: string
  createdAt: string
  updatedAt: string
  _count?: {
    documents: number
  }
  documents?: WorkflowDocumentSummary[]
}

export interface WorkflowDocumentSummary {
  id: string
  name: string
  version: string
  status: string
  responsibleRole?: string
  createdAt: string
}

export interface WorkflowDocument {
  id: string
  categoryId: string
  name: string
  applicableScope?: string
  triggerCondition?: string
  inputMaterials?: string
  outputMaterials?: string
  responsibleRole?: string
  steps?: string
  relatedChecklist?: string
  relatedTemplates?: string
  relatedArchive?: string
  riskNotes?: string
  version: string
  status: string
  createdAt: string
  updatedAt: string
  category?: {
    id: string
    name: string
  }
}

export interface CreateWorkflowCategoryParams {
  name: string
  description?: string
  sortOrder?: number
}

export interface UpdateWorkflowCategoryParams {
  name?: string
  description?: string
  sortOrder?: number
  status?: string
}

export interface CreateWorkflowDocumentParams {
  categoryId: string
  name: string
  applicableScope?: string
  triggerCondition?: string
  inputMaterials?: string
  outputMaterials?: string
  responsibleRole?: string
  steps?: string
  relatedChecklist?: string
  relatedTemplates?: string
  relatedArchive?: string
  riskNotes?: string
  version?: string
}

export interface UpdateWorkflowDocumentParams {
  name?: string
  applicableScope?: string
  triggerCondition?: string
  inputMaterials?: string
  outputMaterials?: string
  responsibleRole?: string
  steps?: string
  relatedChecklist?: string
  relatedTemplates?: string
  relatedArchive?: string
  riskNotes?: string
  version?: string
  status?: string
}

export interface QueryWorkflowDocumentParams extends PaginationParams {
  categoryId?: string
  keyword?: string
  status?: string
}
