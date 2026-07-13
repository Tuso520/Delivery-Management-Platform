import request from './request'
import { runIdempotentUpload } from './upload-idempotency'
import type {
  KnowledgeCategory,
  CreateKnowledgeItemDto as BaseCreateKnowledgeItemDto,
  CreateKnowledgeVersionDto as BaseCreateKnowledgeVersionDto,
  KnowledgeContentType,
  KnowledgeItem,
  KnowledgeItemPage,
  KnowledgeReviewSubmissionResult,
  KnowledgeSummary,
  QueryKnowledgeItemDto,
  UpdateKnowledgeItemDto,
  KnowledgeVersion,
  KnowledgeDraftFileUploadResult,
} from '@/types/knowledge'

export type KnowledgePrimaryContentPayload =
  | {
      contentType: 'FILE'
      fileVersionId: string
      markdownContent: null
      externalUrl: null
    }
  | {
      contentType: 'MARKDOWN'
      fileVersionId: null
      markdownContent: string
      externalUrl: null
    }
  | {
      contentType: 'LINK'
      fileVersionId: null
      markdownContent: null
      externalUrl: string
    }

type ExplicitKnowledgeVersionFields =
  | 'contentType'
  | 'fileVersionId'
  | 'markdownContent'
  | 'externalUrl'
  | 'supportingFileVersionIds'
  | 'revision'

export type CreateKnowledgeItemPayload = Omit<
  BaseCreateKnowledgeItemDto,
  'contentType' | 'fileVersionId' | 'markdownContent' | 'externalUrl' | 'supportingFileVersionIds'
> &
  KnowledgePrimaryContentPayload & { supportingFileVersionIds: string[] }

export type CreateKnowledgeVersionPayload = Omit<
  BaseCreateKnowledgeVersionDto,
  ExplicitKnowledgeVersionFields
> &
  KnowledgePrimaryContentPayload & { supportingFileVersionIds: string[] }

export type UpdateKnowledgeVersionPayload = CreateKnowledgeVersionPayload & { revision: number }

const validKnowledgeContentTypes: ReadonlySet<KnowledgeContentType> = new Set([
  'FILE',
  'MARKDOWN',
  'LINK',
])

function assertExplicitVersionPayload(
  data: CreateKnowledgeVersionPayload | UpdateKnowledgeVersionPayload,
): void {
  if (
    !validKnowledgeContentTypes.has(data.contentType) ||
    !Array.isArray(data.supportingFileVersionIds)
  ) {
    throw new TypeError('Knowledge version content and supporting files must be explicit')
  }
}

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

  create(data: CreateKnowledgeItemPayload) {
    return request.post<KnowledgeItem>('/knowledge', data)
  },

  update(id: string, data: UpdateKnowledgeItemDto) {
    return request.patch<KnowledgeItem>(`/knowledge/${id}`, data)
  },

  createVersion(id: string, data: CreateKnowledgeVersionPayload) {
    assertExplicitVersionPayload(data)
    return request.post<KnowledgeVersion>(`/knowledge/${id}/versions`, data)
  },

  updateVersion(versionId: string, data: UpdateKnowledgeVersionPayload) {
    assertExplicitVersionPayload(data)
    return request.patch<KnowledgeVersion>(`/knowledge-versions/${versionId}`, data)
  },

  submitReview(versionId: string, revision: number, approvalTemplateId?: string) {
    return request.post<KnowledgeReviewSubmissionResult>(
      `/knowledge-versions/${versionId}/submit-review`,
      { revision, ...(approvalTemplateId ? { approvalTemplateId } : {}) },
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
