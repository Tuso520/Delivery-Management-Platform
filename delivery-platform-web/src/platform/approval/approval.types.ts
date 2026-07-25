import type { PaginatedData } from '@/types/api'

export type ApprovalBusinessType =
  | 'PROJECT_CREATE'
  | 'PROJECT_ARCHIVE_FILE'
  | 'STANDARD'
  | 'KNOWLEDGE'
  | 'ARCHIVE_TEMPLATE'

export type ApprovalApproverType = 'role' | 'user'
export type ApprovalStepMode = 'SINGLE' | 'ALL_SIGN' | 'ANY_N' | 'PARALLEL'

export interface ApprovalTemplateStep {
  id?: string
  stepOrder: number
  stepName: string
  mode: ApprovalStepMode
  requiredCount?: number
  approverType: ApprovalApproverType
  approverValues: string[]
}

export interface ApprovalTemplate {
  id: string
  templateCode: string
  templateName: string
  businessType: ApprovalBusinessType
  countryCode?: string | null
  enabled: boolean
  steps: ApprovalTemplateStep[]
  createdAt?: string
  updatedAt?: string
}

export interface SaveApprovalTemplateDto {
  templateCode: string
  templateName: string
  businessType: ApprovalBusinessType
  countryCode?: string
  enabled?: boolean
  steps: ApprovalTemplateStep[]
}

export type ApprovalTemplatePage = PaginatedData<ApprovalTemplate>
