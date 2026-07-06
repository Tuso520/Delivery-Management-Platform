import request from './request'
import type { PaginatedData } from '@/types/api'
import type {
  KnowledgeCategory,
  KnowledgeArticle,
  KnowledgeFileRevisionDiff,
  CreateKnowledgeCategoryDto,
  UpdateKnowledgeCategoryDto,
  CreateKnowledgeArticleDto,
  UpdateKnowledgeArticleDto,
  QueryKnowledgeArticleDto,
} from '@/types/knowledge'

export const knowledgeApi = {
  // Categories
  getCategories() {
    return request.get<KnowledgeCategory[]>('/knowledge/categories')
  },

  getCategoryById(id: string) {
    return request.get<KnowledgeCategory>(`/knowledge/categories/${id}`)
  },

  createCategory(data: CreateKnowledgeCategoryDto) {
    return request.post<KnowledgeCategory>('/knowledge/categories', data)
  },

  updateCategory(id: string, data: UpdateKnowledgeCategoryDto) {
    return request.put<KnowledgeCategory>(`/knowledge/categories/${id}`, data)
  },

  deleteCategory(id: string) {
    return request.delete<void>(`/knowledge/categories/${id}`)
  },

  // Articles
  getArticles(params: QueryKnowledgeArticleDto) {
    return request.get<PaginatedData<KnowledgeArticle>>('/knowledge/articles', { params })
  },

  getArticleById(id: string) {
    return request.get<KnowledgeArticle>(`/knowledge/articles/${id}`)
  },

  createArticle(data: CreateKnowledgeArticleDto) {
    return request.post<KnowledgeArticle>('/knowledge/articles', data)
  },

  updateArticle(id: string, data: UpdateKnowledgeArticleDto) {
    return request.put<KnowledgeArticle>(`/knowledge/articles/${id}`, data)
  },

  deleteArticle(id: string) {
    return request.delete<void>(`/knowledge/articles/${id}`)
  },

  publishArticle(id: string) {
    return request.post<KnowledgeArticle>(`/knowledge/articles/${id}/publish`)
  },

  deprecateArticle(id: string) {
    return request.post<KnowledgeArticle>(`/knowledge/articles/${id}/deprecate`)
  },

  getVersions(id: string) {
    return request.get<NonNullable<KnowledgeArticle['versions']>>(`/knowledge/articles/${id}/versions`)
  },

  submitFileRevision(articleId: string, attachmentId: string, data: FormData) {
    return request.post(`/knowledge/articles/${articleId}/files/${attachmentId}/revisions`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    })
  },

  getFileRevisionDiff(id: string) {
    return request.get<KnowledgeFileRevisionDiff>(`/knowledge/file-revisions/${id}/diff`)
  },

  /** Upload a file as a knowledge article */
  uploadFile(data: FormData) {
    return request.post<KnowledgeArticle>('/knowledge/articles', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
