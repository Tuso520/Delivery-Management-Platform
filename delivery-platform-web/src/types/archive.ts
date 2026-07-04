export interface ArchiveItem {
  id: string
  projectId: string
  templateItemId: string
  parentId?: string
  stageCode: string
  itemNo: number
  level: number
  name: string
  secondName?: string
  usageDescription?: string
  isRequired: boolean
  isStar: boolean
  isSensitive: boolean
  needReview: boolean
  responsibleUserId?: string
  reviewUserId?: string
  status: string
  dueDate?: string
  completedAt?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  responsibleUser?: { id: string; realName: string; username: string }
  reviewUser?: { id: string; realName: string; username: string }
  files?: Array<{
    id: string
    fileName: string
    originalName: string
    fileExt: string
    fileSize?: number
    versionNo: string
    fileStatus: string
    uploadTime: string
    isCurrent?: boolean
  }>
  children?: ArchiveItem[]
}

export interface ArchiveStage {
  stageCode: string
  items: ArchiveItem[]
}

export interface ArchiveTreeData {
  projectId: string
  stages: ArchiveStage[]
}

export interface ArchiveStatistics {
  totalItems: number
  completedItems: number
  requiredItems: number
  starItems: number
  completionRate: number
  stages: Array<{
    stageCode: string
    stageName: string
    totalItems: number
    completedItems: number
    completionRate: number
  }>
}

export const ARCHIVE_ITEM_STATUS_OPTIONS = [
  { value: 'NotStarted', label: '未开始', type: 'info' },
  { value: 'PendingUpload', label: '待上传', type: 'warning' },
  { value: 'Uploaded', label: '已上传', type: 'primary' },
  { value: 'Reviewing', label: '审核中', type: 'warning' },
  { value: 'Approved', label: '已通过', type: 'success' },
  { value: 'Rejected', label: '已驳回', type: 'danger' },
  { value: 'NotApplicable', label: '不适用', type: '' },
  { value: 'Archived', label: '已归档', type: '' },
]

export interface ArchiveTemplate {
  id: string
  templateCode: string
  templateName: string
  projectType?: string
  countryCode?: string
  languageCode?: string
  version: string
  status: string
  description?: string
  createdAt: string
  updatedAt: string
  _count?: { items: number }
}

export interface ArchiveTemplateItem {
  id: string
  templateId: string
  parentId?: string
  stageCode: string
  itemNo: number
  level: number
  name: string
  secondName?: string
  usageDescription?: string
  isRequired: boolean
  isStar: boolean
  isSensitive: boolean
  needReview: boolean
  responsibleRole?: string
  reviewRole?: string
  allowedFileTypes?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  children?: ArchiveTemplateItem[]
}
