import request from './request'
import { runIdempotentUpload } from './upload-idempotency'
import type {
  CreateStandardDto,
  CreateStandardVersionDto,
  QueryStandardDto,
  ReviewSubmissionResult,
  Standard,
  StandardPage,
  StandardRelation,
  StandardRelationType,
  StandardSummary,
  StandardVersion,
  StandardDraftFileUploadResult,
  UpdateStandardDto,
} from '@/types/standard'

export const standardApi = {
  uploadDraftFile(file: File, changeDescription?: string) {
    const data = new FormData()
    data.append('file', file)
    data.append('ownerType', 'STANDARD')
    if (changeDescription?.trim()) data.append('changeDescription', changeDescription.trim())
    const operation = JSON.stringify({
      ownerType: 'STANDARD',
      changeDescription: changeDescription?.trim(),
    })
    return runIdempotentUpload(file, operation, (idempotencyKey) =>
      request.post<StandardDraftFileUploadResult>('/files/drafts', data, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Idempotency-Key': idempotencyKey,
        },
        timeout: 120000,
      }),
    )
  },

  getSummary() {
    return request.get<StandardSummary>('/standards/summary')
  },

  getList(params: QueryStandardDto) {
    return request.get<StandardPage>('/standards', { params })
  },

  getById(id: string) {
    return request.get<Standard>(`/standards/${id}`)
  },

  create(data: CreateStandardDto) {
    return request.post<Standard>('/standards', data)
  },

  update(id: string, data: UpdateStandardDto) {
    return request.patch<Standard>(`/standards/${id}`, data)
  },

  createVersion(id: string, data: CreateStandardVersionDto) {
    return request.post<StandardVersion>(`/standards/${id}/versions`, data)
  },

  updateVersion(versionId: string, data: CreateStandardVersionDto) {
    return request.patch<StandardVersion>(`/standard-versions/${versionId}`, data)
  },

  submitReview(versionId: string, revision: number, approvalTemplateId?: string) {
    return request.post<ReviewSubmissionResult>(`/standard-versions/${versionId}/submit-review`, {
      revision,
      ...(approvalTemplateId ? { approvalTemplateId } : {}),
    })
  },

  getRelations(id: string) {
    return request.get<StandardRelation[]>(`/standards/${id}/relations`)
  },

  createRelation(
    id: string,
    data: { targetStandardId: string; relationType: StandardRelationType },
  ) {
    return request.post<StandardRelation>(`/standards/${id}/relations`, data)
  },

  deleteRelation(id: string, relationId: string) {
    return request.delete<void>(`/standards/${id}/relations/${relationId}`)
  },

  archive(id: string) {
    return request.post<Pick<Standard, 'id' | 'status' | 'archivedAt'>>(`/standards/${id}/archive`)
  },

  downloadFile(logicalFileId: string) {
    return request.get<Blob>(`/files/${logicalFileId}/download`, {
      responseType: 'blob',
      timeout: 120000,
    })
  },
}
