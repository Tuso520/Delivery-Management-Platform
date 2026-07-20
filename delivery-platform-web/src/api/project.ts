import request from './request'
import type { PaginatedData } from '@/types/api'
import type {
  CreateProjectDto,
  Project,
  ProjectConfiguration,
  ProjectMember,
  ProjectStatusActionDto,
  ProjectStatusCommand,
  ProjectSummary,
  ProjectUserReferenceOption,
  ProjectUserReferencePurpose,
  QueryProjectDto,
  UpdateProjectDto,
  UpdateProjectProgressDto,
} from '@/types/project'

export const projectApi = {
  getConfiguration(includeInactive = false) {
    return includeInactive
      ? request.get<ProjectConfiguration>('/projects/configuration', { params: { includeInactive: true } })
      : request.get<ProjectConfiguration>('/projects/configuration')
  },

  getList(params: QueryProjectDto) {
    return request.get<PaginatedData<Project>>('/projects', { params })
  },

  getSummary() {
    return request.get<ProjectSummary>('/projects/summary')
  },

  getSummaryByScope(scope: 'mine' | 'all') {
    return request.get<ProjectSummary>('/projects/summary', { params: { scope } })
  },

  getArchived(params: QueryProjectDto) {
    return request.get<PaginatedData<Project>>('/projects/archived', { params })
  },

  getUserOptions(purpose: ProjectUserReferencePurpose) {
    return request.get<ProjectUserReferenceOption[]>('/references/users', {
      params: { purpose },
    })
  },

  getById(id: string) {
    return request.get<Project>(`/projects/${id}`)
  },

  create(data: CreateProjectDto, idempotencyKey: string) {
    return request.post<Project>('/projects', data, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
  },

  update(id: string, data: UpdateProjectDto) {
    return request.patch<Project>(`/projects/${id}`, data)
  },

  updateProgress(id: string, data: UpdateProjectProgressDto) {
    return request.patch<Project>(`/projects/${id}/progress`, data)
  },

  changeStatus(id: string, command: ProjectStatusCommand, data: ProjectStatusActionDto) {
    return request.post<Project>(`/projects/${id}/${command}`, data)
  },

  permanentDelete(id: string) {
    return request.delete<void>(`/projects/${id}/permanent`, { silent: true })
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
