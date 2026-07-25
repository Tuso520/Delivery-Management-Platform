import request from './request'
import { fileApi } from '@/platform/file/file.api'
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
    return fileApi.uploadDraftFile<StandardDraftFileUploadResult>(
      'STANDARD',
      file,
      changeDescription,
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
    return fileApi.download(logicalFileId)
  },
}
