import request from './request'
import type { PermissionGroup } from '@/types/role'

export const permissionApi = {
  getAll() {
    return request.get<PermissionGroup[]>('/permissions')
  },
}
