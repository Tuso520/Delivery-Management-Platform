import type { PaginatedData } from './api'

export type NotificationChannel = 'IN_APP' | 'FEISHU' | 'WECOM'

export type NotificationRecipientPolicyType =
  | 'BUSINESS_OWNER'
  | 'PROJECT_MEMBERS'
  | 'ROLE'
  | 'USER'

export interface NotificationRecipientPolicy {
  type: NotificationRecipientPolicyType
  values: string[]
}

export interface NotificationRule {
  id: string
  name: string
  eventType: string
  channels: NotificationChannel[]
  recipientPolicy: NotificationRecipientPolicy
  templateId: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface SaveNotificationRuleDto {
  name: string
  eventType: string
  channels: NotificationChannel[]
  recipientPolicy: NotificationRecipientPolicy
  templateId?: string
  enabled?: boolean
}

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

export interface SystemSettings {
  project: {
    defaultPageSize: number
    defaultRiskLevel: 'Low' | 'Medium' | 'High'
  }
  attachment: {
    maxSizeMb: number
  }
  file: {
    allowedExtensions: string[]
  }
  approval: {
    timeoutDays: number
  }
  knowledge: {
    defaultPageSize: number
  }
  security: {
    sessionHours: number
    loginMaxAttempts: number
  }
}

export interface UpdateSystemSettingsDto {
  project?: Partial<SystemSettings['project']>
  attachment?: Partial<SystemSettings['attachment']>
  file?: Partial<SystemSettings['file']>
  approval?: Partial<SystemSettings['approval']>
  knowledge?: Partial<SystemSettings['knowledge']>
  security?: Partial<SystemSettings['security']>
}

export interface SystemTime {
  serverTime: string
  epochMilliseconds: number
  timezone: string
  utcOffsetMinutes: number
}

export type IntegrationProvider = 'FEISHU' | 'WECOM'

export interface IntegrationConfiguration {
  appId?: string | null
  appSecret?: string | null
  webhookUrl?: string | null
  verificationToken?: string | null
  encryptKey?: string | null
  corpId?: string | null
  agentId?: string | null
  secret?: string | null
  contactDepartmentId?: string | null
  testRecipient?: string | null
}

export interface IntegrationConfig {
  id: string
  provider: IntegrationProvider
  configName: string
  isEnabled: boolean
  description?: string | null
  configuration: IntegrationConfiguration
  capabilities: string[]
  updatedAt: string
}

export interface UpdateIntegrationDto {
  configName?: string
  description?: string
  isEnabled?: boolean
  appId?: string
  appSecret?: string
  webhookUrl?: string
  verificationToken?: string
  encryptKey?: string
  corpId?: string
  agentId?: string
  secret?: string
  contactDepartmentId?: string
  testRecipient?: string
}

export interface IntegrationActionResult {
  success?: boolean
  message?: string
  errorReason?: string
  total?: number
  added?: number
  created?: number
  updated?: number
  disabled?: number
  conflicts?: number
  [key: string]: unknown
}

export interface IntegrationSyncLog {
  id: string
  provider: IntegrationProvider
  action: 'CONNECTION_TEST' | 'CONTACT_SYNC' | 'NOTIFICATION_TEST'
  status: string
  summary?: Record<string, unknown> | null
  errorReason?: string | null
  startedAt: string
  completedAt?: string | null
  createdAt: string
  requester?: {
    id: string
    username: string
    realName: string
  } | null
}

export type IntegrationSyncLogPage = PaginatedData<IntegrationSyncLog>
