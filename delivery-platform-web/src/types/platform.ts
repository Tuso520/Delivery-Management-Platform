import type { PaginatedData } from './api'

export interface DictionaryItem {
  id: string
  itemValue: string
  itemLabel: string
  status: string
  sortOrder: number
  extraData?: Record<string, unknown>
}

export interface DictionaryCategory {
  id: string
  categoryCode: string
  categoryName: string
  description?: string
  items: DictionaryItem[]
}

export interface RoleOption {
  id: string
  roleCode: string
  roleName: string
}

export interface DepartmentNode {
  id: string
  departmentCode: string
  departmentName: string
  parentId?: string
  managerId?: string
  status: string
  sortOrder: number
  manager?: { id: string; realName: string }
  userCount: number
  children: DepartmentNode[]
}

export interface ApprovalStep {
  id?: string
  stepOrder: number
  stepName: string
  approverType: 'role' | 'user'
  approverValue: string
}

export interface ApprovalTemplate {
  id: string
  templateCode: string
  templateName: string
  businessType: string
  countryCode?: string
  isEnabled: boolean
  steps: ApprovalStep[]
}

export interface ApprovalTask {
  id: string
  businessType: string
  businessId: string
  businessTitle?: string
  currentStep: number
  status: string
  comment?: string
  createdAt: string
  template: { templateName: string; templateCode: string }
  applicant: { id: string; realName: string }
  approver?: { id: string; realName: string }
  actions: Array<{
    id: string
    stepOrder: number
    action: string
    comment?: string
    createdAt: string
    actor: { id: string; realName: string }
  }>
}

export interface SkillDefinition {
  id: string
  skillCode: string
  skillName: string
  category: string
  maxLevel: number
  status: string
  assessments: Array<{
    id: string
    level: number
    selfScore?: number
    managerScore?: number
    finalScore?: number
    period: string
    evidenceNote?: string
    user: { id: string; realName: string }
    assessor: { id: string; realName: string }
  }>
}

export interface TrainingPlan {
  id: string
  title: string
  category: string
  trainerName?: string
  trainerId?: string
  trainer?: { id: string; realName: string; username: string }
  startAt: string
  endAt?: string
  location?: string
  status: string
  description?: string
  attachments?: Array<{
    id: string
    category?: string
    originalName: string
    fileExt: string
    fileSize: string
    createdAt: string
  }>
  participants: Array<{
    id: string
    attendance: string
    signedAt?: string
    score?: number
    completedAt?: string
    user: { id: string; realName: string; username: string }
  }>
}

export interface ProjectRetrospective {
  id: string
  projectId: string
  summary: string
  lessonsLearned?: string
  problemCategory?: string
  status: string
  project: { id: string; projectCode: string; projectName: string }
  actions: Array<{
    id: string
    title: string
    status: string
    dueDate?: string
    verificationNote?: string
    owner: { id: string; realName: string }
  }>
}

export interface StorageStatus {
  bucket: string
  available: boolean
  provider: string
  attachmentCount: number
  attachmentBytes: string
  backupCount: number
}

export interface BackupRecord {
  id: string
  backupType: string
  status: string
  storagePath?: string
  fileSize?: string
  errorMessage?: string
  createdAt: string
  requester: { id: string; realName: string; username: string }
}

export interface IntegrationConfig {
  id: string
  provider: string
  configName: string
  configValue: Record<string, unknown>
  isEnabled: boolean
  description?: string
  updatedAt: string
}

export type PlatformPage<T> = PaginatedData<T>
