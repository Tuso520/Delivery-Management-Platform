import request from './request'
import type { PaginatedData } from '@/types/api'

export interface Attachment {
  id: string
  ownerType: string
  ownerId: string
  projectId?: string
  category?: string
  originalName: string
  fileExt: string
  fileSize: string
  mimeType: string
  capturedAt?: string
  captureSource?: 'camera' | 'album' | 'file'
  latitude?: number
  longitude?: number
  remark?: string
  createdAt: string
  uploader: { id: string; realName: string; username: string }
}

export interface AttachmentPreview {
  fileName: string
  fileExt: string
  mimeType: string
  previewKind: 'image' | 'pdf' | 'html' | 'text' | 'unsupported'
  viewer: 'image' | 'pdf' | 'document' | 'spreadsheet' | 'presentation' | 'text' | 'download'
  title: string
  html?: string
  text?: string
  reason?: string
}

export const attachmentApi = {
  upload(data: FormData) {
    return request.post<Attachment[]>('/attachments', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  getList(params: Record<string, string | number | undefined>) {
    return request.get<PaginatedData<Attachment>>('/attachments', { params })
  },
  getContent(id: string) {
    return request.get<Blob>(`/attachments/${id}/content`, {
      responseType: 'blob',
      timeout: 120000,
    })
  },
  getPreview(id: string) {
    return request.get<AttachmentPreview>(`/attachments/${id}/preview`, {
      timeout: 120000,
    })
  },
  delete(id: string) {
    return request.delete<void>(`/attachments/${id}`)
  },
}
