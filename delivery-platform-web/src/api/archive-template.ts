import request from './request'
import type { ArchiveTemplate, ArchiveTemplateItem } from '@/types/archive'

export interface ArchiveTemplateItemPayload {
  parentId?: string
  stageCode: string
  name: string
  secondName?: string
  usageDescription?: string
  isRequired?: boolean
  isStar?: boolean
  isSensitive?: boolean
  needReview?: boolean
  responsibleRole?: string
  reviewRole?: string
  evidenceFileTypes?: string[]
  sortOrder?: number
}

export const archiveTemplateApi = {
  getList(params?: { projectType?: string; countryCode?: string; languageCode?: string }) {
    return request.get<ArchiveTemplate[]>('/archive-templates', { params })
  },

  getById(id: string) {
    return request.get<ArchiveTemplate & { items: ArchiveTemplateItem[] }>(`/archive-templates/${id}`)
  },

  create(data: { templateCode: string; templateName: string; projectType?: string; countryCode?: string; languageCode?: string; description?: string }) {
    return request.post<ArchiveTemplate>('/archive-templates', data)
  },

  update(id: string, data: Partial<{ templateName: string; projectType: string; countryCode: string; languageCode: string; version: string; status: string; description: string }>) {
    return request.put<ArchiveTemplate>(`/archive-templates/${id}`, data)
  },

  delete(id: string) {
    return request.delete<void>(`/archive-templates/${id}`)
  },

  getItems(templateId: string, tree?: boolean) {
    return request.get<ArchiveTemplateItem[]>(`/archive-templates/${templateId}/items`, {
      params: tree ? { tree: 'true' } : undefined,
    })
  },

  createItem(templateId: string, data: ArchiveTemplateItemPayload) {
    return request.post<ArchiveTemplateItem>(`/archive-templates/${templateId}/items`, data)
  },

  updateItem(itemId: string, data: Partial<ArchiveTemplateItemPayload>) {
    return request.put<ArchiveTemplateItem>(`/archive-templates/items/${itemId}`, data)
  },

  deleteItem(itemId: string) {
    return request.delete<void>(`/archive-templates/items/${itemId}`)
  },
}
