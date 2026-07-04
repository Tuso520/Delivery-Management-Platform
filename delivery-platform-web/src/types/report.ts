export interface DailyReport {
  id: string
  projectId: string
  authorId: string
  reportType: 'daily' | 'weekly' | 'monthly'
  reportDate: string
  content: string
  workHours: number | null
  projectProgress: string | null
  paymentProgress: string | null
  riskNotes: string | null
  nextPlan: string | null
  status: 'Draft' | 'Submitted' | 'Reviewed'
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  author?: { id: string; realName: string }
  project?: { id: string; projectName: string; projectCode: string }
  reviewer?: { id: string; realName: string }
}

export interface CreateReportDto {
  projectId: string
  reportType: string
  reportDate: string
  content: string
  workHours?: number
  projectProgress?: string
  paymentProgress?: string
  riskNotes?: string
  nextPlan?: string
}

export interface UpdateReportDto {
  content?: string
  workHours?: number
  projectProgress?: string
  paymentProgress?: string
  riskNotes?: string
  nextPlan?: string
}

export interface QueryReportDto {
  page: number
  pageSize: number
  projectId?: string
  authorId?: string
  reportType?: string
  dateFrom?: string
  dateTo?: string
  status?: string
}

export const REPORT_TYPE_OPTIONS = [
  { label: '日报', value: 'daily' },
  { label: '周报', value: 'weekly' },
  { label: '月报', value: 'monthly' },
]

export const REPORT_STATUS_OPTIONS = [
  { label: '草稿', value: 'Draft' },
  { label: '已提交', value: 'Submitted' },
  { label: '已审核', value: 'Reviewed' },
]
