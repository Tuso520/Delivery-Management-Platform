import request from './request'
import type { PermissionModule } from '@/types/role'

export const permissionApi = {
  getAll() {
    return request.get<PermissionModule[]>('/permissions')
  },
}
