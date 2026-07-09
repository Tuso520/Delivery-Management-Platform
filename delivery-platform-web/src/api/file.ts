import request from './request'
import type { AxiosProgressEvent } from 'axios'
import type { AttachmentPreview } from './attachment'
import type { UploadedFile } from '@/types/file'

export interface UploadProgressEvent {
  percent: number
  loaded: number
  total: number
}

export type FilePreviewMode = 'view' | 'edit'

export type FilePreviewViewer =
  | 'onlyoffice'
  | 'pdf'
  | 'image'
  | 'deep-zoom-image'
  | 'markdown'
  | 'xmind'
  | 'cad'
  | 'visio'
  | 'video'
  | 'audio'
  | 'unavailable'

export interface FilePreviewRoute {
  viewer: FilePreviewViewer
  category:
    | 'office'
    | 'pdf'
    | 'image'
    | 'markdown'
    | 'xmind'
    | 'cad'
    | 'visio'
    | 'video'
    | 'audio'
    | 'unsupported'
  mode: FilePreviewMode
  editable: boolean
  readonly: boolean
  supportsDownload: boolean
  reason?: string
}

export interface XmindOutlineNode {
  title: string
  children: XmindOutlineNode[]
}

export interface XmindOutlineSheet {
  title: string
  root: XmindOutlineNode
}

export interface FilePreviewSession {
  file: {
    id: string
    projectId: string
    archiveItemId: string | null
    fileName: string
    originalName: string
    fileExt: string
    fileSize: string
    mimeType: string
    versionNo: string
    isCurrent: boolean
    fileStatus: string
    updatedAt: string
  }
  route: FilePreviewRoute
  urls: {
    content: string
    thumbnail?: string
    download: string
  }
  signed: {
    expiresAt: string
  }
  onlyOffice?: {
    available: boolean
    docsUrl?: string
    reason?: string
    config?: Record<string, unknown>
  }
  xmind?: {
    sheets: XmindOutlineSheet[]
  }
}

export const fileApi = {
  /**
   * 上传文件
   */
  upload(
    projectId: string,
    archiveItemId: string | undefined,
    file: File,
    remark?: string,
    onProgress?: (event: UploadProgressEvent) => void,
  ) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('projectId', projectId)
    if (archiveItemId) {
      formData.append('archiveItemId', archiveItemId)
    }
    if (remark) {
      formData.append('remark', remark)
    }

    return request.post<UploadedFile>('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (!onProgress) {
          return
        }

        const total = event.total ?? file.size
        const percent = total > 0 ? Math.round((event.loaded / total) * 100) : 0
        onProgress({
          percent,
          loaded: event.loaded,
          total,
        })
      },
    })
  },

  /**
   * 获取文件详情
   */
  getById(id: string) {
    return request.get<UploadedFile>(`/files/${id}`)
  },

  /**
   * 下载私有文件
   */
  download(id: string) {
    return request.get<Blob>(`/files/${id}/download`, {
      responseType: 'blob',
      timeout: 120000,
    })
  },

  /**
   * 生成短时有效的在线预览链接
   */
  createPreviewLink(id: string) {
    return request.post<{ url: string; expiresAt: string }>(`/files/${id}/preview-link`)
  },

  /**
   * 获取在线预览结构化内容
   */
  getPreview(id: string) {
    return request.get<AttachmentPreview>(`/files/${id}/preview`, {
      timeout: 120000,
    })
  },

  createPreviewSession(id: string, mode: FilePreviewMode = 'view') {
    return request.get<FilePreviewSession>(`/files/${id}/preview-session`, {
      params: { mode },
      timeout: 120000,
    })
  },

  /**
   * 删除文件（软删除）
   */
  delete(id: string) {
    return request.delete<void>(`/files/${id}`)
  },

  /**
   * 设置文件为当前版本
   */
  setCurrentVersion(id: string) {
    return request.post<UploadedFile>(`/files/${id}/set-current`)
  },

  /**
   * 获取档案目录项下的所有文件
   */
  getArchiveFiles(archiveItemId: string) {
    return request.get<UploadedFile[]>(`/archive-items/${archiveItemId}/files`)
  },
}
