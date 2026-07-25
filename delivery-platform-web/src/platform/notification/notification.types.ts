export type NotificationChannel = 'IN_APP' | 'FEISHU'

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
