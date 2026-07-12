import type { PaginatedData, PaginationParams } from './api'

export const REVIEW_SOURCE_TYPES = [
  'PROJECT_ARCHIVE',
  'STANDARD',
  'KNOWLEDGE',
  'ARCHIVE_TEMPLATE',
  'PROJECT_CREATE',
] as const

export type ReviewSourceType = (typeof REVIEW_SOURCE_TYPES)[number]

export const REVIEW_TASK_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const

export type ReviewTaskStatus = (typeof REVIEW_TASK_STATUSES)[number]
export type ReviewMode = 'SINGLE' | 'ALL_SIGN' | 'ANY_N' | 'SERIAL' | 'PARALLEL'
export type ReviewStepStatus = 'WAITING' | 'ACTIVE' | 'APPROVED' | 'REJECTED' | 'SKIPPED'
export type ReviewAssigneeStatus = 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED'
export type ReviewDecision = 'APPROVED' | 'REJECTED'

export interface ReviewUser {
  id: string
  realName: string
}

export interface ReviewFileAsset {
  id: string
  originalName: string
  extension: string | null
  mimeType: string
  size: number | string
}

export interface ReviewFileVersion {
  id: string
  logicalFileId: string
  version: string
  versionSequence: number
  status: string
  uploadedAt: string
  logicalFile: {
    id: string
    currentVersionId: string | null
    displayName: string
  }
  asset: ReviewFileAsset
}

export interface ReviewAssignee {
  id: string
  reviewStepId: string
  assigneeUserId: string
  status: ReviewAssigneeStatus
  decision: ReviewDecision | null
  actedAt: string | null
  comment: string | null
  assignee: ReviewUser
}

export interface ReviewStep {
  id: string
  reviewTaskId: string
  stepNo: number
  mode: ReviewMode
  requiredCount: number
  status: ReviewStepStatus
  startedAt: string | null
  completedAt: string | null
  assignees: ReviewAssignee[]
}

export interface ReviewHistoryEvent {
  id: string
  reviewTaskId: string
  stepNo: number | null
  actorUserId: string
  action: string
  comment: string | null
  metadata: unknown
  createdAt: string
  actor: ReviewUser
}

export interface ReviewTask {
  id: string
  sourceType: ReviewSourceType
  sourceId: string
  sourceVersionId: string | null
  projectId: string | null
  fileVersionId: string | null
  title: string
  locationLabel: string | null
  status: ReviewTaskStatus
  reviewMode: ReviewMode
  currentStepNo: number
  totalSteps: number
  submittedBy: string
  submittedAt: string
  completedAt: string | null
  dueAt: string | null
  submitter: ReviewUser
  fileVersion: ReviewFileVersion | null
  steps: ReviewStep[]
  actionEvents?: ReviewHistoryEvent[]
}

export interface ReviewSummary {
  myPending: number
  allPending: number
  todayAdded: number
  overdue: number
}

export interface ReviewSummaryResponse extends Partial<ReviewSummary> {
  total?: number
  pending?: number
  approved?: number
  rejected?: number
}

export interface QueryReviewTaskParams extends PaginationParams {
  keyword?: string
  status?: ReviewTaskStatus
  sourceType?: ReviewSourceType
}

export type ReviewTaskPage = PaginatedData<ReviewTask>

export interface ApproveReviewTaskDto {
  comment?: string
}

export interface RejectReviewTaskDto {
  comment: string
}
