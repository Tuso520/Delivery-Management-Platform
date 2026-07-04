import request from './request'
import type { OkrObjective, KeyResult, PerformanceScore, CreateObjectiveDto, CreateKeyResultDto, CreateScoreDto } from '@/types/okr'

export const okrApi = {
  // Objectives
  getObjectives(params?: { ownerId?: string; period?: string }) {
    return request.get<OkrObjective[]>('/okr/objectives', { params })
  },

  getObjectiveById(id: string) {
    return request.get<OkrObjective>(`/okr/objectives/${id}`)
  },

  createObjective(data: CreateObjectiveDto) {
    return request.post<OkrObjective>('/okr/objectives', data)
  },

  updateObjective(id: string, data: Partial<CreateObjectiveDto & { progress: number; status: string }>) {
    return request.put<OkrObjective>(`/okr/objectives/${id}`, data)
  },

  deleteObjective(id: string) {
    return request.delete<void>(`/okr/objectives/${id}`)
  },

  getMyObjectives() {
    return request.get<OkrObjective[]>('/okr/my-objectives')
  },

  getTeamObjectives() {
    return request.get<OkrObjective[]>('/okr/team-objectives')
  },

  // Key Results
  createKeyResult(objectiveId: string, data: CreateKeyResultDto) {
    return request.post<KeyResult>(`/okr/objectives/${objectiveId}/key-results`, data)
  },

  updateKeyResult(krId: string, data: Partial<CreateKeyResultDto & { progress: number; status: string }>) {
    return request.put<KeyResult>(`/okr/key-results/${krId}`, data)
  },

  deleteKeyResult(krId: string) {
    return request.delete<void>(`/okr/key-results/${krId}`)
  },

  // Scores
  createScore(objectiveId: string, data: CreateScoreDto) {
    return request.post<PerformanceScore>(`/okr/objectives/${objectiveId}/scores`, data)
  },

  updateScore(scoreId: string, data: {
    selfScore?: number
    projectRatio?: string
    managerScore?: number
    nextGoal?: string
    comment?: string
    status?: string
  }) {
    return request.put<PerformanceScore>(`/okr/scores/${scoreId}`, data)
  },

  submitScore(scoreId: string, data: {
    managerScore: number
    nextGoal?: string
    comment?: string
  }) {
    return request.post<PerformanceScore>(`/okr/scores/${scoreId}/submit`, data)
  },
}
