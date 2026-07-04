import request from './request'
import type { PaginatedData } from '@/types/api'
import type {
  WorkflowCategory,
  WorkflowDocument,
  WorkflowDocumentSummary,
  CreateWorkflowCategoryParams,
  UpdateWorkflowCategoryParams,
  CreateWorkflowDocumentParams,
  UpdateWorkflowDocumentParams,
  QueryWorkflowDocumentParams,
} from '@/types/workflow'

export const workflowApi = {
  // Categories
  getCategories() {
    return request.get<WorkflowCategory[]>('/workflow/categories')
  },

  getCategoryById(id: string) {
    return request.get<WorkflowCategory>(`/workflow/categories/${id}`)
  },

  createCategory(data: CreateWorkflowCategoryParams) {
    return request.post<WorkflowCategory>('/workflow/categories', data)
  },

  updateCategory(id: string, data: UpdateWorkflowCategoryParams) {
    return request.put<WorkflowCategory>(`/workflow/categories/${id}`, data)
  },

  deleteCategory(id: string) {
    return request.delete<void>(`/workflow/categories/${id}`)
  },

  // Documents
  getDocuments(params: QueryWorkflowDocumentParams) {
    return request.get<PaginatedData<WorkflowDocument>>('/workflow/documents', { params })
  },

  getDocumentById(id: string) {
    return request.get<WorkflowDocument>(`/workflow/documents/${id}`)
  },

  createDocument(data: CreateWorkflowDocumentParams) {
    return request.post<WorkflowDocument>('/workflow/documents', data)
  },

  updateDocument(id: string, data: UpdateWorkflowDocumentParams) {
    return request.put<WorkflowDocument>(`/workflow/documents/${id}`, data)
  },

  deleteDocument(id: string) {
    return request.delete<void>(`/workflow/documents/${id}`)
  },

  search(keyword: string) {
    return request.get<WorkflowDocumentSummary[]>('/workflow/search', { params: { keyword } })
  },
}
