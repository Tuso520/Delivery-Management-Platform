import type { PaginatedData } from './api'

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

export interface DocumentPreviewSettings {
  enabled: boolean
  docsUrl: string
  jwtSecretConfigured: boolean
  ready: boolean
  source: 'DATABASE' | 'ENVIRONMENT' | 'NONE'
  updatedAt: string | null
}

export interface UpdateDocumentPreviewSettingsDto {
  enabled?: boolean
  docsUrl?: string
  jwtSecret?: string
}

export type IntegrationProvider = 'FEISHU'

export interface IntegrationConfiguration {
  appId?: string | null
  appSecret?: string | null
  contactDepartmentId?: string | null
  oauthRedirectUri?: string | null
  testRecipient?: string | null
  testRecipientEmail?: string | null
  testRecipientUserId?: string | null
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
  contactDepartmentId?: string
  oauthRedirectUri?: string
  testRecipient?: string
  testRecipientEmail?: string
  testRecipientUserId?: string
}

export interface IntegrationNotificationRecipient {
  id: string
  username: string
  realName: string
  email: string | null
  department: { id: string; departmentName: string } | null
}

export type IntegrationNotificationRecipientPage = PaginatedData<IntegrationNotificationRecipient>

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
