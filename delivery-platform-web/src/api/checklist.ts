import request from './request'
import type { PaginatedData } from '@/types/api'
import type {
  ChecklistTemplate,
  ChecklistTemplateItem,
  CreateChecklistTemplateParams,
  UpdateChecklistTemplateParams,
  CreateChecklistTemplateItemParams,
  UpdateChecklistTemplateItemParams,
  ReorderItemsParams,
  QueryChecklistTemplateParams,
} from '@/types/checklist'

export const checklistApi = {
  // Templates
  getTemplates(params: QueryChecklistTemplateParams) {
    return request.get<PaginatedData<ChecklistTemplate>>('/checklist/templates', { params })
  },

  getTemplateById(id: string) {
    return request.get<ChecklistTemplate>(`/checklist/templates/${id}`)
  },

  createTemplate(data: CreateChecklistTemplateParams) {
    return request.post<ChecklistTemplate>('/checklist/templates', data)
  },

  updateTemplate(id: string, data: UpdateChecklistTemplateParams) {
    return request.put<ChecklistTemplate>(`/checklist/templates/${id}`, data)
  },

  deleteTemplate(id: string) {
    return request.delete<void>(`/checklist/templates/${id}`)
  },

  // Template Items
  addItem(templateId: string, data: CreateChecklistTemplateItemParams) {
    return request.post<ChecklistTemplateItem>(`/checklist/templates/${templateId}/items`, data)
  },

  updateItem(itemId: string, data: UpdateChecklistTemplateItemParams) {
    return request.put<ChecklistTemplateItem>(`/checklist/items/${itemId}`, data)
  },

  deleteItem(itemId: string) {
    return request.delete<void>(`/checklist/items/${itemId}`)
  },

  reorderItems(templateId: string, data: ReorderItemsParams) {
    return request.post<ChecklistTemplate>(`/checklist/templates/${templateId}/reorder`, data)
  },
}
