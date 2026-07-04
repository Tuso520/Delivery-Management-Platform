import request from './request'
import type {
  DashboardOverview,
  CountryStats,
  ProjectStats,
  TodoItem,
  UserProject,
} from '@/types/dashboard'

export const dashboardApi = {
  getOverview() {
    return request.get<DashboardOverview>('/dashboard/overview')
  },

  getCountryStats(countryCode: string) {
    return request.get<CountryStats>(`/dashboard/country/${countryCode}`)
  },

  getProjectStats(projectId: string) {
    return request.get<ProjectStats>(`/dashboard/project/${projectId}`)
  },

  getMyTodos() {
    return request.get<TodoItem[]>('/dashboard/my-todos')
  },

  getMyProjects() {
    return request.get<UserProject[]>('/dashboard/my-projects')
  },
}
