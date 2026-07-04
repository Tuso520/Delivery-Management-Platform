import request from './request'
import type { PaginatedData } from '@/types/api'
import type {
  DocumentTemplate,
  DocumentTemplateVersion,
  CreateTemplateDto,
  UpdateTemplateDto,
  QueryTemplateDto,
  CreateTemplateVersionDto,
} from '@/types/template'

export const templateApi = {
  getList(params: QueryTemplateDto) {
    return request.get<PaginatedData<DocumentTemplate>>('/templates', { params })
  },

  getById(id: string) {
    return request.get<DocumentTemplate>(`/templates/${id}`)
  },

  create(data: CreateTemplateDto) {
    return request.post<DocumentTemplate>('/templates', data)
  },

  update(id: string, data: UpdateTemplateDto) {
    return request.put<DocumentTemplate>(`/templates/${id}`, data)
  },

  delete(id: string) {
    return request.delete<void>(`/templates/${id}`)
  },

  addVersion(templateId: string, data: CreateTemplateVersionDto) {
    return request.post<DocumentTemplateVersion>(`/templates/${templateId}/versions`, data)
  },

  publish(templateId: string) {
    return request.post<DocumentTemplate>(`/templates/${templateId}/publish`)
  },

  getDownloadInfo(templateId: string) {
    return request.get<{
      attachmentId: string | null
      fileName: string
      fileExt: string
      fileSize: string | null
      createdAt: string
      generatedContent: string | null
    }>(`/templates/${templateId}/download`)
  },
}
