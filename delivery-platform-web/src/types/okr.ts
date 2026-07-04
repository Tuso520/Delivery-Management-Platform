export interface OkrObjective {
  id: string
  title: string
  description: string | null
  period: string
  periodType: string
  ownerId: string
  departmentId: string | null
  weight: number
  progress: number
  goalType: 'OKR' | 'KPI'
  scoringFlow: string
  scoringMethod: string
  scorerIds: string[] | null
  scoringContent: ScoringCriterion[] | null
  calculationRule: string | null
  status: string
  createdAt: string
  updatedAt: string
  owner?: { id: string; realName: string }
  keyResults?: KeyResult[]
  scores?: PerformanceScore[]
}

export interface KeyResult {
  id: string
  objectiveId: string
  title: string
  targetValue: string | null
  currentValue: string | null
  weight: number
  progress: number
  status: string
  createdAt: string
  updatedAt: string
}

export interface PerformanceScore {
  id: string
  objectiveId: string
  scorerId: string
  month: string
  selfScore: number | null
  managerScore: number | null
  projectRatio: string | null
  comment: string | null
  nextGoal: string | null
  status: string
  createdAt: string
  updatedAt: string
  scorer?: { id: string; realName: string }
}

export interface CreateObjectiveDto {
  title: string
  description?: string
  period: string
  periodType: string
  departmentId?: string
  weight?: number
  goalType?: 'OKR' | 'KPI'
  scoringFlow?: string
  scoringMethod?: string
  scorerIds?: string[]
  scoringContent?: ScoringCriterion[]
  calculationRule?: string
}

export interface ScoringCriterion {
  name: string
  weight: number
  description?: string
  standard?: string
  requirements?: string
  sourceField?: string
  operator?: string
  threshold?: string
}

export interface CreateKeyResultDto {
  title: string
  targetValue?: string
  currentValue?: string
  weight?: number
}

export interface CreateScoreDto {
  month: string
  selfScore?: number
  projectRatio?: string
  comment?: string
}

export const PERIOD_OPTIONS = [
  { label: '2026', value: '2026' },
  { label: '2026-06', value: '2026-06' },
  { label: '2026-Q2', value: '2026-Q2' },
  { label: 'Q1', value: 'Q1' },
  { label: 'Q2', value: 'Q2' },
  { label: 'Q3', value: 'Q3' },
  { label: 'Q4', value: 'Q4' },
]

export const PERIOD_TYPE_OPTIONS = [
  { label: '季度', value: 'quarterly' },
  { label: '月度', value: 'monthly' },
  { label: '年度', value: 'yearly' },
]

export const GOAL_CATEGORY_OPTIONS = [
  { label: '年度 KPI', goalType: 'KPI', periodType: 'yearly' },
  { label: '年度 OKR', goalType: 'OKR', periodType: 'yearly' },
  { label: '季度 OKR', goalType: 'OKR', periodType: 'quarterly' },
  { label: '月度 KPI', goalType: 'KPI', periodType: 'monthly' },
] as const

export const OBJECTIVE_STATUS_OPTIONS = [
  { label: '进行中', value: 'Active' },
  { label: '已完成', value: 'Completed' },
  { label: '已取消', value: 'Cancelled' },
]
