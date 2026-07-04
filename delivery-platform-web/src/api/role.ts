import request from './request'
import type { Role, RoleDetail, CreateRoleDto, UpdateRoleDto, AssignPermissionsDto } from '@/types/role'

export const roleApi = {
  getList() {
    return request.get<Role[]>('/roles')
  },

  getById(id: string) {
    return request.get<RoleDetail>(`/roles/${id}`)
  },

  create(data: CreateRoleDto) {
    return request.post<Role>('/roles', data)
  },

  update(id: string, data: UpdateRoleDto) {
    return request.put<Role>(`/roles/${id}`, data)
  },

  delete(id: string) {
    return request.delete<void>(`/roles/${id}`)
  },

  assignPermissions(id: string, data: AssignPermissionsDto) {
    return request.post<RoleDetail>(`/roles/${id}/permissions`, data)
  },
}
