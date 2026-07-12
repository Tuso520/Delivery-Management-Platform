import request from './request'
import type { NotificationRule, SaveNotificationRuleDto } from '@/types/settings'

export type CreateNotificationRuleDto = SaveNotificationRuleDto
export type UpdateNotificationRuleDto = Partial<SaveNotificationRuleDto>

export const notificationApi = {
  getRules() {
    return request.get<NotificationRule[]>('/notification-rules')
  },

  createRule(data: CreateNotificationRuleDto) {
    return request.post<NotificationRule>('/notification-rules', data)
  },

  updateRule(id: string, data: UpdateNotificationRuleDto) {
    return request.patch<NotificationRule>(`/notification-rules/${id}`, data)
  },

  deleteRule(id: string) {
    return request.delete<void>(`/notification-rules/${id}`)
  },

  toggleRule(id: string) {
    return request.post<NotificationRule>(`/notification-rules/${id}/toggle`)
  },
}
