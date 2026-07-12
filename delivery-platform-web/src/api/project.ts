import request from './request'
import type { PaginatedData } from '@/types/api'
import type {
  CreateProjectDto,
  Project,
  ProjectMember,
  ProjectStatusActionDto,
  ProjectStatusCommand,
  ProjectSummary,
  ProjectUserReferenceOption,
  ProjectUserReferencePurpose,
  QueryProjectDto,
  UpdateProjectAcceptanceDto,
  UpdateProjectDto,
  UpdateProjectStageDto,
} from '@/types/project'

export const projectApi = {
  getList(params: QueryProjectDto) {
    return request.get<PaginatedData<Project>>('/projects', { params })
  },

  getSummary() {
    return request.get<ProjectSummary>('/projects/summary')
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

  updateStage(id: string, data: UpdateProjectStageDto) {
    return request.patch<Project>(`/projects/${id}/stage`, data)
  },

  updateAcceptance(id: string, data: UpdateProjectAcceptanceDto) {
    return request.patch<Project>(`/projects/${id}/acceptance`, data)
  },

  changeStatus(id: string, command: ProjectStatusCommand, data: ProjectStatusActionDto) {
    return request.post<Project>(`/projects/${id}/${command}`, data)
  },

  delete(id: string) {
    return request.delete<void>(`/projects/${id}`, { silent: true })
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
