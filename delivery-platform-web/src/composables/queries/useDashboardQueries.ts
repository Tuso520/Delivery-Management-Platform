import { useQuery } from '@tanstack/vue-query'

import { dashboardApi } from '@/api/dashboard'
import { queryKeys } from '@/query/keys'

export function useDashboardQueries() {
  const projectSummary = useQuery({
    queryKey: queryKeys.dashboard.projectSummary(),
    queryFn: dashboardApi.getProjectSummary,
    staleTime: 60_000,
  })
  const myTasks = useQuery({
    queryKey: queryKeys.dashboard.myTasks(),
    queryFn: dashboardApi.getMyTasks,
    staleTime: 30_000,
  })
  const highRisks = useQuery({
    queryKey: queryKeys.dashboard.highRisks(),
    queryFn: dashboardApi.getHighRisks,
    staleTime: 30_000,
  })
  const recentProjects = useQuery({
    queryKey: queryKeys.dashboard.recentProjects(),
    queryFn: dashboardApi.getRecentProjects,
    staleTime: 60_000,
  })
  const recentActivities = useQuery({
    queryKey: queryKeys.dashboard.recentActivities(),
    queryFn: dashboardApi.getRecentActivities,
    staleTime: 30_000,
  })

  return {
    projectSummary,
    myTasks,
    highRisks,
    recentProjects,
    recentActivities,
  }
}
