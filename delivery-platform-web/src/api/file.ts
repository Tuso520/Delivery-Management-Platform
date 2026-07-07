import request from './request'
import type { AxiosProgressEvent } from 'axios'
import type { UploadedFile } from '@/types/file'

export interface UploadProgressEvent {
  percent: number
  loaded: number
  total: number
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
