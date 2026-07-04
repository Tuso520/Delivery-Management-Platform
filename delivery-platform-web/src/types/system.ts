export interface SystemConfig {
  id: string
  configKey: string
  configValue: string
  description: string | null
  configType: string
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertSystemConfigDto {
  configKey: string
  configValue: string
  description?: string
  configType?: string
}

export interface OperationLog {
  id: string
  userId: string
  module: string
  action: string
  targetType: string
  targetId: string
  beforeData: unknown
  afterData: unknown
  ipAddress: string | null
  userAgent: string | null
  result: string
  createdAt: string
  user: {
    id: string
    username: string
    realName: string
  } | null
}

export interface NotificationItem {
  id: string
  title: string
  content: string
  notificationType: string
  relatedType: string | null
  relatedId: string | null
  isRead: boolean
  createdAt: string
  readAt: string | null
}

export interface NotificationRule {
  id: string
  name: string
  eventType: string
  channel: string
  recipientRole: string | null
  template: string | null
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}
