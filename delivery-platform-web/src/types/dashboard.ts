export interface DashboardOverview {
  totalProjects: number
  activeProjects: number
  highRiskProjects: number
  delayedProjects: number
  pendingReviews: number
  avgCompletionRate: number
  byStatus: { status: string; count: number }[]
  byStage: { stage: string; count: number }[]
  acceptedProjects: number
  draftProjects: number
  totalContractAmount: number
  totalPlannedPaymentAmount: number
  totalReceivedAmount: number
  outstandingPaymentAmount: number
  overduePaymentAmount: number
  overduePaymentCount: number
  paymentCompletionRate: number
  recentProjects: {
    id: string
    projectCode: string
    projectName: string
    countryCode: string
    status: string
    riskLevel: string
    createdAt: string
  }[]
}

export interface CountryStats {
  countryCode: string
  totalProjects: number
  activeProjects: number
  completionRate: number
}

export interface ProjectStats {
  projectId: string
  projectName: string
  projectCode: string
  status: string
  riskLevel: string
  totalArchiveItems: number
  completedArchiveItems: number
  pendingUploadItems: number
  reviewingItems: number
  rejectedItems: number
  totalChecklistItems: number
  completedChecklistItems: number
  pendingChecklistItems: number
  totalFiles: number
  memberCount: number
}

export interface TodoItem {
  type: 'pending_upload' | 'pending_review' | 'rejected'
  id: string
  projectId: string
  projectName: string
  itemName: string
  stageCode: string
  status: string
  createdAt: string
}

export interface UserProject {
  id: string
  projectCode: string
  projectName: string
  countryCode: string
  projectStatus: string
  riskLevel: string
  currentStage: string
  role: string
}
