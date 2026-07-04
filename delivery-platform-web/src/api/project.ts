import request from './request'
import type { PaginatedData } from '@/types/api'
import type { Project, CreateProjectDto, UpdateProjectDto, QueryProjectDto, ProjectMember } from '@/types/project'

export const projectApi = {
  getList(params: QueryProjectDto) {
    return request.get<PaginatedData<Project>>('/projects', { params })
  },

  getById(id: string) {
    return request.get<Project>(`/projects/${id}`)
  },

  create(data: CreateProjectDto) {
    return request.post<Project>('/projects', data)
  },

  update(id: string, data: UpdateProjectDto) {
    return request.put<Project>(`/projects/${id}`, data)
  },

  delete(id: string) {
    return request.delete<void>(`/projects/${id}`)
  },

  getMembers(projectId: string) {
    return request.get<ProjectMember[]>(`/projects/${projectId}/members`)
  },

  addMember(projectId: string, data: { userId: string; projectRole: string }) {
    return request.post<ProjectMember>(`/projects/${projectId}/members`, data)
  },

  removeMember(projectId: string, memberId: string) {
    return request.delete<void>(`/projects/${projectId}/members/${memberId}`)
  },
}
