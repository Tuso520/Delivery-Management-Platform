export type StatusDomain =
  | 'project'
  | 'file'
  | 'review'
  | 'risk'
  | 'template'
  | 'task'
  | 'user'
  | 'currency'
  | 'role'
  | 'department'
  | 'standard'
  | 'knowledge'
  | 'archive'
  | 'integration'
  | 'log'
  | 'notification'
  | 'approval'
  | 'payment'

export type StatusColor = 'green' | 'orange' | 'gray' | 'blue' | 'red' | 'purple'

interface StatusDefinition {
  color: StatusColor
  labelKey?: string
}

const commonVersionStatuses: Record<string, StatusDefinition> = {
  DRAFT: { color: 'gray' },
  IN_REVIEW: { color: 'orange' },
  PUBLISHED: { color: 'green' },
  APPROVED: { color: 'green' },
  REJECTED: { color: 'red' },
  DISABLED: { color: 'gray' },
  ARCHIVED: { color: 'gray' },
}

export const statusRegistry: Record<StatusDomain, Record<string, StatusDefinition>> = {
  project: {
    DRAFT: { color: 'gray', labelKey: 'status.DRAFT' },
    ACTIVE: { color: 'green', labelKey: 'status.ACTIVE' },
    PAUSED: { color: 'orange', labelKey: 'status.PAUSED' },
    COMPLETED: { color: 'blue', labelKey: 'status.COMPLETED' },
    CANCELLED: { color: 'red', labelKey: 'status.CANCELLED' },
    ARCHIVED: { color: 'gray', labelKey: 'projects.archived' },
  },
  file: {
    ...commonVersionStatuses,
    PROCESSING: { color: 'blue' },
    REVIEWING: { color: 'orange' },
    UNAVAILABLE: { color: 'red' },
  },
  review: {
    PENDING: { color: 'orange', labelKey: 'review.status.PENDING' },
    APPROVED: { color: 'green', labelKey: 'review.status.APPROVED' },
    REJECTED: { color: 'red', labelKey: 'review.status.REJECTED' },
    CANCELLED: { color: 'gray', labelKey: 'review.status.CANCELLED' },
  },
  risk: {
    Low: { color: 'green', labelKey: 'risk.Low' },
    Medium: { color: 'orange', labelKey: 'risk.Medium' },
    High: { color: 'red', labelKey: 'risk.High' },
    Critical: { color: 'red', labelKey: 'risk.Critical' },
  },
  template: commonVersionStatuses,
  task: {
    WAITING: { color: 'gray' },
    PENDING: { color: 'orange' },
    ACTIVE: { color: 'blue' },
    APPROVED: { color: 'green' },
    REJECTED: { color: 'red' },
    SKIPPED: { color: 'gray' },
    COMPLETED: { color: 'green' },
  },
  user: {
    Active: { color: 'green' },
    ACTIVE: { color: 'green' },
    Inactive: { color: 'gray' },
    INACTIVE: { color: 'gray' },
    Locked: { color: 'red' },
    LOCKED: { color: 'red' },
  },
  currency: {
    Active: { color: 'green' },
    Inactive: { color: 'gray' },
  },
  role: {
    Active: { color: 'green' },
    Inactive: { color: 'gray' },
  },
  department: {
    Active: { color: 'green' },
    Inactive: { color: 'gray' },
  },
  standard: {
    ...commonVersionStatuses,
    ACTIVE: { color: 'green' },
  },
  knowledge: {
    ...commonVersionStatuses,
    ACTIVE: { color: 'green' },
  },
  archive: {
    NOT_STARTED: { color: 'gray', labelKey: 'archive.status.NOT_STARTED' },
    NOTSTARTED: { color: 'gray', labelKey: 'archive.status.NOT_STARTED' },
    PENDINGUPLOAD: { color: 'orange', labelKey: 'archive.status.PENDING_UPLOAD' },
    UPLOADED: { color: 'blue', labelKey: 'archive.status.UPLOADED' },
    REVIEWING: { color: 'orange', labelKey: 'archive.status.IN_REVIEW' },
    IN_REVIEW: { color: 'orange', labelKey: 'archive.status.IN_REVIEW' },
    APPROVED: { color: 'green', labelKey: 'archive.status.APPROVED' },
    PUBLISHED: { color: 'green', labelKey: 'archive.status.PUBLISHED' },
    COMPLETED: { color: 'green', labelKey: 'archive.status.COMPLETED' },
    REJECTED: { color: 'red', labelKey: 'archive.status.REJECTED' },
    NOTAPPLICABLE: { color: 'gray', labelKey: 'archive.status.NOT_APPLICABLE' },
    ARCHIVED: { color: 'gray', labelKey: 'archive.status.ARCHIVED' },
  },
  integration: {
    SUCCESS: { color: 'green' },
    FAILED: { color: 'red' },
    FAILURE: { color: 'red' },
    PENDING: { color: 'orange' },
    RUNNING: { color: 'blue' },
    SKIPPED: { color: 'gray' },
    DEAD: { color: 'red' },
    ENABLED: { color: 'green' },
    DISABLED: { color: 'gray' },
    CONFIGURED: { color: 'green' },
    MISSING: { color: 'orange' },
  },
  log: {
    success: { color: 'green', labelKey: 'logs.results.success' },
    failure: { color: 'red', labelKey: 'logs.results.failure' },
    failed: { color: 'red', labelKey: 'logs.results.failed' },
    denied: { color: 'orange', labelKey: 'logs.results.denied' },
  },
  notification: {
    ENABLED: { color: 'green' },
    DISABLED: { color: 'gray' },
  },
  approval: {
    ENABLED: { color: 'green' },
    DISABLED: { color: 'gray' },
  },
  payment: {
    PENDING: { color: 'orange' },
    PARTIAL: { color: 'blue' },
    PAID: { color: 'green' },
    OVERDUE: { color: 'red' },
    CANCELLED: { color: 'gray' },
    Pending: { color: 'orange' },
    Partial: { color: 'blue' },
    Received: { color: 'green' },
    Overdue: { color: 'red' },
  },
}

export function statusDefinition(domain: StatusDomain, status: string): StatusDefinition {
  return statusRegistry[domain][status] ?? { color: 'gray' }
}
