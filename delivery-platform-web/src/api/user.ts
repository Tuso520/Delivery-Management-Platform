import request from './request'
import type { PaginatedData } from '@/types/api'
import type { UserListItem, CreateUserDto, UpdateUserDto, QueryUserParams, AssignRolesDto, ResetPasswordDto } from '@/types/user'
import type { Role } from '@/types/role'

export const userApi = {
  getList(params: QueryUserParams) {
    return request.get<PaginatedData<UserListItem>>('/users', { params })
  },

  getById(id: string) {
    return request.get<UserListItem>(`/users/${id}`)
  },

  create(data: CreateUserDto) {
    return request.post<UserListItem>('/users', data)
  },

  update(id: string, data: UpdateUserDto) {
    return request.put<UserListItem>(`/users/${id}`, data)
  },

  delete(id: string) {
    return request.delete<void>(`/users/${id}`)
  },

  assignRoles(id: string, data: AssignRolesDto) {
    return request.post<UserListItem>(`/users/${id}/roles`, data)
  },

  disable(id: string) {
    return request.post<{ id: string; username: string; realName: string; status: string }>(`/users/${id}/disable`)
  },

  enable(id: string) {
    return request.post<{ id: string; username: string; realName: string; status: string }>(`/users/${id}/enable`)
  },

  resetPassword(id: string, data: ResetPasswordDto) {
    return request.post<{ message: string }>(`/users/${id}/reset-password`, data)
  },

  getAllRoles() {
    return request.get<Role[]>('/roles')
  },
}
