import request from './request'
import type { SystemSettings, SystemTime, UpdateSystemSettingsDto } from '@/types/settings'

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

export const systemConfigApi = {
  getPublic() {
    return request.get<Record<string, string | null>>('/system-config/public', { silent: true })
  },
}
