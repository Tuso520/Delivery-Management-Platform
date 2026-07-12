import type { AxiosProgressEvent } from 'axios'

import request from './request'
import { runIdempotentUpload } from './upload-idempotency'
import type { ProjectArchiveTargetTree, ProjectArchiveTemplateDiff } from '@/types/archive'

export interface CreateTemporaryArchiveItemPayload {
  name: string
  description?: string
  reason: string
  ownerUserId: string
  required?: boolean
  reviewRequired?: boolean
  approvalTemplateId?: string
  suggestedForTemplate?: boolean
  allowMultipleFiles?: boolean
  allowedExtensions?: string[]
}

export interface UploadProjectArchiveFilePayload {
  uploadMode: 'REPLACE' | 'NEW_VERSION'
  revisionLevel: 'MINOR' | 'MAJOR'
  logicalFileId?: string
  createNewLogicalFile?: boolean
  changeDescription?: string
}

export interface UnifiedLogicalFile {
  id: string
  ownerType: string
  ownerId: string
  displayName: string
  status: string
  currentVersion?: {
    id: string
    version: string
    status: string
    uploadedAt: string
  } | null
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
}

export const archiveApi = {
  getTree(projectId: string) {
    return request.get<ProjectArchiveTargetTree>(`/projects/${projectId}/archive-tree`)
  },

  getTemplateDiff(projectId: string) {
    return request.get<ProjectArchiveTemplateDiff>(`/projects/${projectId}/archive-template-diff`)
  },

  syncTemplateAdditions(
    projectId: string,
    data: {
      confirmAdditions: true
      folderStableKeys?: string[]
      itemStableKeys?: string[]
    },
  ) {
    return request.post<ProjectArchiveTemplateDiff>(
      `/projects/${projectId}/archive-template-sync`,
      data,
    )
  },

  createTemporaryItem(
    projectId: string,
    folderId: string,
    data: CreateTemporaryArchiveItemPayload,
  ) {
    return request.post(`/projects/${projectId}/archive-folders/${folderId}/items`, data)
  },

  archiveItem(projectId: string, itemId: string, reason?: string) {
    return request.post(`/projects/${projectId}/archive-items/${itemId}/archive`, { reason })
  },

  restoreItem(projectId: string, itemId: string, reason?: string) {
    return request.post(`/projects/${projectId}/archive-items/${itemId}/restore`, { reason })
  },

  uploadFile(
    projectId: string,
    itemId: string,
    file: File,
    data: UploadProjectArchiveFilePayload,
    onProgress?: (percentage: number) => void,
  ) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('uploadMode', data.uploadMode)
    formData.append('revisionLevel', data.revisionLevel)
    if (data.logicalFileId) formData.append('logicalFileId', data.logicalFileId)
    if (data.createNewLogicalFile) formData.append('createNewLogicalFile', 'true')
    if (data.changeDescription) formData.append('changeDescription', data.changeDescription)

    const operation = JSON.stringify({ projectId, itemId, ...data })
    return runIdempotentUpload(file, operation, (idempotencyKey) =>
      request.post<UnifiedLogicalFile>(
        `/projects/${projectId}/archive-items/${itemId}/files`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Idempotency-Key': idempotencyKey,
          },
          timeout: 120000,
          onUploadProgress: (event: AxiosProgressEvent) => {
            if (!onProgress) return
            const total = event.total ?? file.size
            onProgress(total > 0 ? Math.round((event.loaded / total) * 100) : 0)
          },
        },
      ),
    )
  },
}
