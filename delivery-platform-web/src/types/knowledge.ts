import type { PaginatedData } from '@/types/api'

export const KNOWLEDGE_CONTENT_TYPES = ['FILE', 'MARKDOWN', 'LINK'] as const
export type KnowledgeContentType = (typeof KNOWLEDGE_CONTENT_TYPES)[number]

export const KNOWLEDGE_ITEM_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'REJECTED',
  'PUBLISHED',
  'ARCHIVED',
] as const
export type KnowledgeItemStatus = (typeof KNOWLEDGE_ITEM_STATUSES)[number]

export interface KnowledgeFileAsset {
  id: string
  originalName: string
  extension: string | null
  mimeType: string
  size: string | number
}

export interface KnowledgeFileVersion {
  id: string
  logicalFileId: string
  version: string
  status: string
  asset: KnowledgeFileAsset
}

export interface KnowledgeSupportingFile {
  id: string
  fileVersionId: string
  role: string
  sortOrder: number
  fileVersion: KnowledgeFileVersion
}

export interface KnowledgeVersion {
  id: string
  knowledgeItemId: string
  version: string
  contentType: KnowledgeContentType
  fileVersionId: string | null
  fileVersion: KnowledgeFileVersion | null
  markdownContent: string | null
  externalUrl: string | null
  supportingFiles: KnowledgeSupportingFile[]
  status: KnowledgeItemStatus
  revision: number
  changeDescription: string | null
  submittedBy: string
  submitter: { id: string; realName: string } | null
  publishedAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgePublishedVersionSummary {
  id: string
  version: string
  contentType: KnowledgeContentType
  status: KnowledgeItemStatus
  publishedAt: string | null
}

export interface KnowledgeItem {
  id: string
  title: string
  categoryId: string
  summary: string | null
  contentType: KnowledgeContentType
  status: KnowledgeItemStatus
  currentPublishedVersionId?: string | null
  currentPublishedVersion: KnowledgePublishedVersionSummary | null
  effectiveAt: string | null
  createdBy: string
  updatedBy: string
  creator: { id: string; realName: string } | null
  updater: { id: string; realName: string } | null
  category: { id: string; name: string } | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  versions?: KnowledgeVersion[]
}

export interface KnowledgeSummary {
  total: number
  draft: number
  inReview: number
  rejected: number
  published: number
  archived: number
  thisMonthNew: number
}

export interface QueryKnowledgeItemDto {
  page?: number
  pageSize?: number
  keyword?: string
  categoryId?: string
  contentType?: KnowledgeContentType
  status?: KnowledgeItemStatus
}

export interface CreateKnowledgeItemDto {
  title: string
  categoryId: string
  summary?: string
  contentType: KnowledgeContentType
  effectiveAt?: string
  version?: string
  fileVersionId?: string | null
  markdownContent?: string | null
  externalUrl?: string | null
  supportingFileVersionIds?: string[]
  changeDescription?: string
}

export interface UpdateKnowledgeItemDto {
  title?: string
  categoryId?: string
  summary?: string | null
  effectiveAt?: string | null
}

export interface CreateKnowledgeVersionDto {
  revision?: number
  version?: string
  contentType?: KnowledgeContentType
  fileVersionId?: string | null
  markdownContent?: string | null
  externalUrl?: string | null
  supportingFileVersionIds?: string[]
  changeDescription?: string
}

export interface KnowledgeReviewSubmissionResult {
  id: string
  status: string
}

export interface KnowledgeDraftFileUploadResult {
  logicalFileId: string
  fileVersionId: string
  fileName: string
  extension: string | null
  mimeType: string
  size: string | number
  status: 'DRAFT'
}

export type KnowledgeItemPage = PaginatedData<KnowledgeItem>

export interface KnowledgeCategory {
  id: string
  name: string
  description: string | null
  parentId: string | null
  sortOrder: number
  status: string
  createdAt: string
  updatedAt: string
  children: KnowledgeCategory[]
  parent?: { id: string; name: string }
}
