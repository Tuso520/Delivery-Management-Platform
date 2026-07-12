import type {
  ReviewAssigneeStatus,
  ReviewHistoryEvent,
  ReviewMode,
  ReviewSourceType,
  ReviewStepStatus,
  ReviewTask,
  ReviewTaskStatus,
} from '@/types/review'

export const REVIEW_SOURCE_LABELS: Record<ReviewSourceType, string> = {
  PROJECT_ARCHIVE: 'review.sources.PROJECT_ARCHIVE',
  STANDARD: 'review.sources.STANDARD',
  KNOWLEDGE: 'review.sources.KNOWLEDGE',
  ARCHIVE_TEMPLATE: 'review.sources.ARCHIVE_TEMPLATE',
  PROJECT_CREATE: 'review.sources.PROJECT_CREATE',
}

export const REVIEW_STATUS_META: Record<ReviewTaskStatus, { label: string; color: string }> = {
  PENDING: { label: 'review.status.PENDING', color: 'orange' },
  APPROVED: { label: 'review.status.APPROVED', color: 'green' },
  REJECTED: { label: 'review.status.REJECTED', color: 'red' },
  CANCELLED: { label: 'review.status.CANCELLED', color: 'gray' },
}

export const REVIEW_STEP_STATUS_META: Record<ReviewStepStatus, { label: string; color: string }> = {
  WAITING: { label: 'review.stepStatus.WAITING', color: 'gray' },
  ACTIVE: { label: 'review.stepStatus.ACTIVE', color: 'orange' },
  APPROVED: { label: 'review.stepStatus.APPROVED', color: 'green' },
  REJECTED: { label: 'review.stepStatus.REJECTED', color: 'red' },
  SKIPPED: { label: 'review.stepStatus.SKIPPED', color: 'gray' },
}

export const REVIEW_ASSIGNEE_STATUS_META: Record<
  ReviewAssigneeStatus,
  { label: string; color: string }
> = {
  WAITING: { label: 'review.assigneeStatus.WAITING', color: 'gray' },
  PENDING: { label: 'review.assigneeStatus.PENDING', color: 'orange' },
  APPROVED: { label: 'review.assigneeStatus.APPROVED', color: 'green' },
  REJECTED: { label: 'review.assigneeStatus.REJECTED', color: 'red' },
  SKIPPED: { label: 'review.assigneeStatus.SKIPPED', color: 'gray' },
}

export const REVIEW_MODE_LABELS: Record<ReviewMode, string> = {
  SINGLE: 'review.modes.SINGLE',
  ALL_SIGN: 'review.modes.ALL_SIGN',
  ANY_N: 'review.modes.ANY_N',
  SERIAL: 'review.modes.SERIAL',
  PARALLEL: 'review.modes.PARALLEL',
}

const REVIEW_ACTION_LABELS: Record<string, string> = {
  SUBMITTED: 'review.actions.SUBMITTED',
  APPROVED: 'review.actions.APPROVED',
  REJECTED: 'review.actions.REJECTED',
  CANCELLED: 'review.actions.CANCELLED',
}

export function reviewFileName(task: ReviewTask): string {
  return (
    task.fileVersion?.asset.originalName || task.fileVersion?.logicalFile.displayName || task.title
  )
}

export function reviewSourceLabel(task: ReviewTask, translate: (key: string) => string): string {
  return translate(REVIEW_SOURCE_LABELS[task.sourceType])
}

export function reviewTaskStatusMeta(task: ReviewTask): { label: string; color: string } {
  return REVIEW_STATUS_META[task.status]
}

export function reviewVersionLabel(task: ReviewTask): string {
  return task.fileVersion?.version || '—'
}

export function reviewProgressLabel(task: ReviewTask, translate: (key: string) => string): string {
  if (task.status === 'APPROVED') return `${task.totalSteps}/${task.totalSteps}`
  if (task.status === 'CANCELLED') return translate('review.status.CANCELLED')
  return `${Math.min(task.currentStepNo, task.totalSteps)}/${task.totalSteps}`
}

export function reviewActionLabel(
  event: ReviewHistoryEvent,
  translate: (key: string) => string,
): string {
  const key = REVIEW_ACTION_LABELS[event.action]
  return key ? translate(key) : event.action
}

export function canActOnReviewTask(
  task: ReviewTask,
  userId: string | undefined,
  permissions: readonly string[],
  roles: readonly string[] = [],
): boolean {
  if (!userId || task.status !== 'PENDING') return false
  const hasActionPermission =
    roles.includes('SUPER_ADMIN') || permissions.includes('file_review:act')
  if (!hasActionPermission) return false

  const currentStep = task.steps.find(
    (step) => step.stepNo === task.currentStepNo && step.status === 'ACTIVE',
  )
  return Boolean(
    currentStep?.assignees.some(
      (assignee) => assignee.assigneeUserId === userId && assignee.status === 'PENDING',
    ),
  )
}
