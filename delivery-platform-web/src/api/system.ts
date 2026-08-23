import request from './request'
import type {
  DocumentPreviewSettings,
  SystemSettings,
  SystemTime,
  UpdateDocumentPreviewSettingsDto,
  UpdateSystemSettingsDto,
} from '@/types/settings'

export const systemSettingsApi = {
  get() {
    return request.get<SystemSettings>('/system-settings')
  },

  update(data: UpdateSystemSettingsDto) {
    return request.patch<SystemSettings>('/system-settings', data)
  },

  getSystemTime() {
    return request.get<SystemTime>('/system-time')
  },
}

export const documentPreviewSettingsApi = {
  get() {
    return request.get<DocumentPreviewSettings>('/document-preview-settings')
  },

  update(data: UpdateDocumentPreviewSettingsDto) {
    return request.patch<DocumentPreviewSettings>('/document-preview-settings', data)
  },
}

export const systemConfigApi = {
  getPublic() {
    return request.get<Record<string, string | null>>('/system-config/public', { silent: true })
  },
}
