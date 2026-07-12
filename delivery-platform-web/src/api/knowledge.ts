import request from './request'
import { runIdempotentUpload } from './upload-idempotency'
import type {
  KnowledgeCategory,
  CreateKnowledgeItemDto,
  CreateKnowledgeVersionDto,
  KnowledgeItem,
  KnowledgeItemPage,
  KnowledgeReviewSubmissionResult,
  KnowledgeSummary,
  QueryKnowledgeItemDto,
  UpdateKnowledgeItemDto,
  KnowledgeVersion,
  KnowledgeDraftFileUploadResult,
} from '@/types/knowledge'

export const knowledgeApi = {
  uploadDraftFile(file: File, changeDescription?: string) {
    const data = new FormData()
    data.append('file', file)
    data.append('ownerType', 'KNOWLEDGE')
    if (changeDescription?.trim()) data.append('changeDescription', changeDescription.trim())
    const operation = JSON.stringify({
      ownerType: 'KNOWLEDGE',
      changeDescription: changeDescription?.trim(),
    })
    return runIdempotentUpload(file, operation, (idempotencyKey) =>
      request.post<KnowledgeDraftFileUploadResult>('/files/drafts', data, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Idempotency-Key': idempotencyKey,
        },
        timeout: 120000,
      }),
    )
  },

  // Unified knowledge items
  getSummary() {
    return request.get<KnowledgeSummary>('/knowledge/summary')
  },

  getList(params: QueryKnowledgeItemDto) {
    return request.get<KnowledgeItemPage>('/knowledge', { params })
  },

  getById(id: string) {
    return request.get<KnowledgeItem>(`/knowledge/${id}`)
  },

  create(data: CreateKnowledgeItemDto) {
    return request.post<KnowledgeItem>('/knowledge', data)
  },

  update(id: string, data: UpdateKnowledgeItemDto) {
    return request.patch<KnowledgeItem>(`/knowledge/${id}`, data)
  },

  createVersion(id: string, data: CreateKnowledgeVersionDto) {
    return request.post<KnowledgeVersion>(`/knowledge/${id}/versions`, data)
  },

  updateVersion(versionId: string, data: CreateKnowledgeVersionDto) {
    return request.patch<KnowledgeVersion>(`/knowledge-versions/${versionId}`, data)
  },

  submitReview(versionId: string, approvalTemplateId?: string) {
    return request.post<KnowledgeReviewSubmissionResult>(
      `/knowledge-versions/${versionId}/submit-review`,
      approvalTemplateId ? { approvalTemplateId } : {},
    )
  },

  archive(id: string) {
    return request.post<Pick<KnowledgeItem, 'id' | 'status' | 'archivedAt'>>(
      `/knowledge/${id}/archive`,
    )
  },

  downloadFile(logicalFileId: string) {
    return request.get<Blob>(`/files/${logicalFileId}/download`, {
      responseType: 'blob',
      timeout: 120000,
    })
  },

  // Categories
  getCategories() {
    return request.get<KnowledgeCategory[]>('/knowledge/categories')
  },
}
