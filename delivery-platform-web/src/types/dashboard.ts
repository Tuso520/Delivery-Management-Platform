export interface DashboardProjectSummary {
  total: number
  active: number
  accepted: number
  highRisk: number
}

export type DashboardTaskType =
  | 'FILE_REVIEW'
  | 'FILE_REVISION'
  | 'PROJECT_RISK'
  | 'PROJECT_STAGE'
  | 'SYSTEM_NOTIFICATION'

export interface DashboardTask {
  id: string
  type: DashboardTaskType
  title: string
  description: string | null
  sourceType: string | null
  sourceId: string | null
  projectId: string | null
  projectName: string | null
  priority: 'URGENT' | 'HIGH' | 'NORMAL'
  dueAt: string | null
  createdAt: string
}

export interface DashboardHighRiskProject {
  id: string
  projectCode: string
  projectName: string
  riskLevel: string
  riskDescription: string | null
  currentStage: string | null
  status: string
  expectedAcceptanceAt: string | null
  updatedAt: string
}

export interface DashboardRecentProject {
  id: string
  projectCode: string
  projectName: string
  countryCode: string
  status: string
  riskLevel: string
  currentStage: string | null
  progressPercent: number | null
  updatedAt: string
}

export interface DashboardRecentActivity {
  id: string
  module: string
  action: string
  projectId: string
  projectName: string
  actorName: string
  occurredAt: string
}
