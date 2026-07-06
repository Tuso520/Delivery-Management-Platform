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

export interface KnowledgeArticle {
  id: string
  categoryId: string
  title: string
  countryCode: string | null
  projectType: string | null
  stageCode: string | null
  applicableRole: string | null
  contentType: string
  fileUrl: string | null
  fileSize: number | null
  fileExt: string | null
  fileCount?: number
  markdownContent: string | null
  sourceStatus: string
  needsRevision: boolean
  background: string | null
  standardPractice: string | null
  steps: string | null
  notes: string | null
  commonMistakes: string | null
  relatedFlow: string | null
  relatedChecklist: string | null
  relatedTemplate: string | null
  version: string
  status: string
  authorId: string
  reviewerId: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  category?: { id: string; name: string }
  author?: { id: string; realName: string; username?: string }
  reviewer?: { id: string; realName: string; username?: string }
  versions?: Array<{
    id: string
    version: string
    changeNotes?: string
    createdAt: string
    creator: { id: string; realName: string }
  }>
}

export interface CreateKnowledgeCategoryDto {
  name: string
  description?: string
  parentId?: string
  sortOrder?: number
}

export interface UpdateKnowledgeCategoryDto {
  name?: string
  description?: string
  sortOrder?: number
}

export interface CreateKnowledgeArticleDto {
  categoryId: string
  title: string
  countryCode?: string
  projectType?: string
  stageCode?: string
  applicableRole?: string
  contentType?: string
  fileUrl?: string
  fileSize?: number
  fileExt?: string
  background?: string
  standardPractice?: string
  steps?: string
  notes?: string
  commonMistakes?: string
  relatedFlow?: string
  relatedChecklist?: string
  relatedTemplate?: string
  markdownContent?: string
  sourceStatus?: string
}

export interface UpdateKnowledgeArticleDto {
  categoryId?: string
  title?: string
  countryCode?: string
  projectType?: string
  stageCode?: string
  applicableRole?: string
  contentType?: string
  fileUrl?: string
  fileSize?: number
  fileExt?: string
  background?: string
  standardPractice?: string
  steps?: string
  notes?: string
  commonMistakes?: string
  relatedFlow?: string
  relatedChecklist?: string
  relatedTemplate?: string
  markdownContent?: string
  sourceStatus?: string
  needsRevision?: boolean
}

export interface QueryKnowledgeArticleDto {
  page?: number
  pageSize?: number
  categoryId?: string
  keyword?: string
  status?: string
  countryCode?: string
  projectType?: string
  contentType?: string
  sourceStatus?: string
}
