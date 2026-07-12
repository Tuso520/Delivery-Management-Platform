import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: mocks,
}))

import { dashboardApi } from '@/api/dashboard'
import { queryKeys } from '@/query/keys'

describe('dashboard target partitions', () => {
  beforeEach(() => {
    mocks.get.mockReset()
  })

  it('only calls the five documented dashboard endpoints in silent mode', () => {
    dashboardApi.getProjectSummary()
    dashboardApi.getMyTasks()
    dashboardApi.getHighRisks()
    dashboardApi.getRecentProjects()
    dashboardApi.getRecentActivities()

    expect(mocks.get.mock.calls).toEqual([
      ['/dashboard/project-summary', { silent: true }],
      ['/dashboard/my-tasks', { silent: true }],
      ['/dashboard/high-risks', { silent: true }],
      ['/dashboard/recent-projects', { silent: true }],
      ['/dashboard/recent-activities', { silent: true }],
    ])
  })

  it('names every dashboard query below the dashboard cache namespace', () => {
    expect(queryKeys.dashboard.projectSummary()[0]).toBe('dashboard')
    expect(queryKeys.dashboard.myTasks()[0]).toBe('dashboard')
    expect(queryKeys.dashboard.highRisks()[0]).toBe('dashboard')
    expect(queryKeys.dashboard.recentProjects()[0]).toBe('dashboard')
    expect(queryKeys.dashboard.recentActivities()[0]).toBe('dashboard')
  })
})
