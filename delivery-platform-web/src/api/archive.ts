import request from './request'
import type { ArchiveTreeData, ArchiveItem, ArchiveStatistics } from '@/types/archive'

export const archiveApi = {
  getArchiveTree(projectId: string) {
    return request.get<ArchiveTreeData>(`/projects/${projectId}/archives`)
  },

  generate(projectId: string, templateId: string) {
    return request.post<{ message: string; totalItems: number; templateName: string }>(
      `/projects/${projectId}/archives/generate`,
      { templateId },
    )
  },

  getStatistics(projectId: string) {
    return request.get<ArchiveStatistics>(`/projects/${projectId}/archives/statistics`)
  },

  getItem(projectId: string, itemId: string) {
    return request.get<ArchiveItem>(`/projects/${projectId}/archives/${itemId}`)
  },

  updateItem(projectId: string, itemId: string, data: { responsibleUserId?: string; reviewUserId?: string; status?: string; dueDate?: string }) {
    return request.put<ArchiveItem>(`/projects/${projectId}/archives/${itemId}`, data)
  },

  markNotApplicable(projectId: string, itemId: string) {
    return request.post<ArchiveItem>(`/projects/${projectId}/archives/${itemId}/mark-not-applicable`)
  },
}
