import request from './request'
import type {
  ArchiveTemplate,
  ArchiveTemplateVersion,
  ArchiveTemplateVersionFolder,
} from '@/types/archive'

export interface CreateArchiveTemplatePayload {
  templateCode: string
  templateName: string
  projectType?: string
  countryCode?: string
  languageCode?: string
  version?: string
  description?: string
}

export interface ArchiveTemplateDraftStructurePayload {
  revision: number
  folders: Array<{
    stableKey: string
    name: string
    description?: string
    sortOrder?: number
    items: Array<{
      stableKey: string
      name: string
      description?: string
      required?: boolean
      reviewRequired?: boolean
      approvalTemplateId?: string
      ownerRoleId?: string
      allowMultipleFiles?: boolean
      allowedExtensions?: string[]
      maxFileSize?: number
      namingRule?: string
      sortOrder?: number
    }>
  }>
}

export const archiveTemplateApi = {
  getList(params?: {
    keyword?: string
    projectType?: string
    countryCode?: string
    languageCode?: string
  }) {
    return request.get<ArchiveTemplate[]>('/archive-templates', { params })
  },

  getById(id: string) {
    return request.get<
      ArchiveTemplate & {
        currentPublishedVersion?: ArchiveTemplateVersion & {
          folders: ArchiveTemplateVersionFolder[]
        }
        versions: ArchiveTemplateVersion[]
      }
    >(`/archive-templates/${id}`)
  },

  create(data: CreateArchiveTemplatePayload) {
    return request.post<
      ArchiveTemplate & {
        draftVersion: Pick<ArchiveTemplateVersion, 'id' | 'versionNo' | 'status'>
      }
    >('/archive-templates', data)
  },

  getVersions(templateId: string) {
    return request.get<ArchiveTemplateVersion[]>(`/archive-templates/${templateId}/versions`)
  },

  createVersion(templateId: string, data: { versionNo?: string; sourceVersionId?: string } = {}) {
    return request.post<ArchiveTemplateVersion>(`/archive-templates/${templateId}/versions`, data)
  },

  getVersion(versionId: string) {
    return request.get<
      ArchiveTemplateVersion & {
        folders: ArchiveTemplateVersionFolder[]
      }
    >(`/archive-template-versions/${versionId}`)
  },

  replaceDraftStructure(versionId: string, data: ArchiveTemplateDraftStructurePayload) {
    return request.patch<ArchiveTemplateVersion>(`/archive-template-versions/${versionId}`, data)
  },

  submitReview(versionId: string, approvalTemplateId?: string) {
    return request.post<{ id: string; status: string }>(
      `/archive-template-versions/${versionId}/submit-review`,
      approvalTemplateId ? { approvalTemplateId } : {},
    )
  },

  disable(templateId: string) {
    return request.post<ArchiveTemplate>(`/archive-templates/${templateId}/disable`)
  },
}
