import request from './request'
import type { PaginatedData, PaginationParams } from '@/types/api'
import type { NotificationItem, NotificationRule } from '@/types/system'

export interface QueryNotificationParams extends PaginationParams {
  isRead?: string
  notificationType?: string
}

export interface CreateNotificationDto {
  userId: string
  title: string
  content: string
  notificationType: string
  relatedType?: string
  relatedId?: string
}

export interface CreateNotificationRuleDto {
  name: string
  eventType: string
  channel?: string
  recipientRole?: string
  template?: string
  isEnabled?: boolean
}

export interface UpdateNotificationRuleDto {
  name?: string
  eventType?: string
  channel?: string
  recipientRole?: string
  template?: string
  isEnabled?: boolean
}

export const notificationApi = {
  getList(params: QueryNotificationParams) {
    return request.get<PaginatedData<NotificationItem>>('/notifications', { params })
  },

  getUnreadCount() {
    return request.get<{ count: number }>('/notifications/unread-count')
  },

  markAsRead(id: string) {
    return request.put<NotificationItem>(`/notifications/${id}/read`)
  },

  markAllAsRead() {
    return request.put<{ count: number }>('/notifications/read-all')
  },

  create(data: CreateNotificationDto) {
    return request.post<NotificationItem>('/notifications', data)
  },

  getRules() {
    return request.get<NotificationRule[]>('/notifications/rules')
  },

  createRule(data: CreateNotificationRuleDto) {
    return request.post<NotificationRule>('/notifications/rules', data)
  },

  updateRule(id: string, data: UpdateNotificationRuleDto) {
    return request.put<NotificationRule>(`/notifications/rules/${id}`, data)
  },

  deleteRule(id: string) {
    return request.delete<void>(`/notifications/rules/${id}`)
  },
}
