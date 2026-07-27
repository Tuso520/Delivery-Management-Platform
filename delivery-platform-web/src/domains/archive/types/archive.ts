export type ArchiveTemplateStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'DISABLED'

export interface ArchiveTemplate {
  id: string
  templateCode: string
  templateName: string
  projectType?: string
  countryCode?: string
  languageCode?: string
  status: ArchiveTemplateStatus
  description?: string
  createdBy?: string | null
  updatedBy?: string | null
  updater?: { id: string; realName: string } | null
  currentPublishedVersion?: {
    id: string
    versionNo: string
    status: 'PUBLISHED'
    publishedAt?: string | null
    _count?: { folders: number; versionItems: number }
  } | null
  createdAt: string
  updatedAt: string
  _count?: { versions?: number; projectSnapshots?: number }
}
export interface ProjectArchiveCurrentVersion {
  id: string
  version: string
  status: string
  uploadedAt: string
  logicalFileId?: string
  previewIdentifier?: string
  displayName?: string
  fileSize?: string
  uploader?: { id: string; realName: string; username: string }
  pendingReview?: boolean
  canPreview?: boolean
}

export interface ProjectArchiveReviewTaskSummary {
  id: string
  title: string
  status: string
  dueAt?: string | null
}

export interface ProjectArchiveTargetItem {
  id: string
  name: string
  description?: string | null
  required: boolean
  reviewRequired: boolean
  approvalTemplateId?: string | null
  ownerRoleId?: string | null
  allowMultipleFiles: boolean
  allowedExtensions?: string[] | null
  maxFileSize?: string | number | null
  namingRule?: string | null
  sourceStableKey?: string | null
  isTemporary: boolean
  temporaryReason?: string | null
  archivedAt?: string | null
  status: string
  currentVersion?: ProjectArchiveCurrentVersion | null
  fileCount: number
  owner?: { id: string; realName: string; username: string } | null
  updatedAt: string
  canUpload: boolean
  canDeleteFile: boolean
  pendingReviewSummary: {
    count: number
    tasks: ProjectArchiveReviewTaskSummary[]
  }
}

export interface ProjectArchiveTargetFolder {
  id: string
  name: string
  description?: string | null
  sortOrder: number
  sourceStableKey?: string | null
  isTemporary: boolean
  archivedAt?: string | null
  completedCount: number
  totalCount: number
  requiredCompletedCount: number
  requiredTotalCount: number
  items: ProjectArchiveTargetItem[]
}

export interface ProjectArchiveTargetTree {
  project: {
    id: string
    code: string
    name: string
    currentStage: string
  }
  template: {
    id?: string | null
    version?: string | null
    latestVersion?: string | null
    hasDiff: boolean
  }
  folders: ProjectArchiveTargetFolder[]
}

export interface ArchiveTemplateVersionItem {
  id?: string
  stableKey: string
  name: string
  description?: string | null
  required: boolean
  reviewRequired: boolean
  approvalTemplateId?: string | null
  ownerRoleId?: string | null
  allowMultipleFiles: boolean
  allowedExtensions?: string[] | null
  maxFileSize?: string | number | null
  namingRule?: string | null
  sortOrder: number
}

export interface ArchiveTemplateVersionFolder {
  id?: string
  stableKey: string
  name: string
  description?: string | null
  sortOrder: number
  items: ArchiveTemplateVersionItem[]
}

export interface ArchiveTemplateVersion {
  id: string
  templateId: string
  versionNo: string
  status: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'REJECTED'
  revision: number
  sourceVersionId?: string | null
  submittedAt?: string | null
  publishedAt?: string | null
  publishedBy?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  folders?: ArchiveTemplateVersionFolder[]
  template?: ArchiveTemplate & { currentPublishedVersionId?: string | null }
  _count?: { folders: number; versionItems: number }
}
