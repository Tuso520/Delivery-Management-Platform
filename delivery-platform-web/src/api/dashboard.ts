import request from './request'
import type {
  DashboardHighRiskProject,
  DashboardProjectSummary,
  DashboardRecentActivity,
  DashboardRecentProject,
  DashboardTask,
} from '@/types/dashboard'

const silentRequest = { silent: true } as const

export const dashboardApi = {
  getProjectSummary() {
    return request.get<DashboardProjectSummary>('/dashboard/project-summary', silentRequest)
  },

  getMyTasks() {
    return request.get<DashboardTask[]>('/dashboard/my-tasks', silentRequest)
  },

  getHighRisks() {
    return request.get<DashboardHighRiskProject[]>('/dashboard/high-risks', silentRequest)
  },

  getRecentProjects() {
    return request.get<DashboardRecentProject[]>('/dashboard/recent-projects', silentRequest)
  },

  getRecentActivities() {
    return request.get<DashboardRecentActivity[]>('/dashboard/recent-activities', silentRequest)
  },
}
