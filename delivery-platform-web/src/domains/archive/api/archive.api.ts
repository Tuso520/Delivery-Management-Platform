import type { AxiosProgressEvent } from 'axios'

import request from '@/api/request'
import { runIdempotentUpload } from '@/platform/file/upload-idempotency'
import { retryTransientUpload } from '@/platform/file/upload-retry'
import type {
  ProjectArchiveTargetTree,
} from '@/domains/archive/types/archive'

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

  uploadFile(
    projectId: string,
    itemId: string,
    file: File,
    data: UploadProjectArchiveFilePayload,
    onProgress?: (percentage: number) => void,
  ) {
    const operation = JSON.stringify({ projectId, itemId, ...data })
    return runIdempotentUpload(file, operation, (idempotencyKey) =>
      retryTransientUpload(() => {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('uploadMode', data.uploadMode)
        formData.append('revisionLevel', data.revisionLevel)
        if (data.logicalFileId) formData.append('logicalFileId', data.logicalFileId)
        if (data.createNewLogicalFile) formData.append('createNewLogicalFile', 'true')
        if (data.changeDescription) formData.append('changeDescription', data.changeDescription)

        return request.post<UnifiedLogicalFile>(
          `/projects/${projectId}/archive-items/${itemId}/files`,
          formData,
          {
            headers: {
              'Idempotency-Key': idempotencyKey,
            },
            silent: true,
            timeout: 120000,
            onUploadProgress: (event: AxiosProgressEvent) => {
              if (!onProgress) return
              const total = event.total ?? file.size
              onProgress(total > 0 ? Math.round((event.loaded / total) * 100) : 0)
            },
          },
        )
      }),
    )
  },
}
