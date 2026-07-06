export interface DocumentTemplate {
  id: string
  templateNo: string
  name: string
  category: string
  countryCode: string | null
  projectType: string | null
  stageCode: string | null
  applicableRole: string | null
  language: string
  fileFormat: string | null
  storagePath: string | null
  status: string
  authorId: string | null
  reviewerId: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  attachmentId?: string | null
  attachmentFileName?: string | null
  previewCount?: number
  downloadCount?: number
  versions?: DocumentTemplateVersion[]
}

export interface DocumentTemplateVersion {
  id: string
  templateId: string
  versionNo: string
  storagePath: string
  changeNotes: string | null
  publisherId: string | null
  publishedAt: string
  createdAt: string
}

export interface CreateTemplateDto {
  name: string
  category: string
  countryCode?: string
  projectType?: string
  stageCode?: string
  applicableRole?: string
  language?: string
  fileFormat?: string
  storagePath?: string
}

export interface UpdateTemplateDto {
  name?: string
  category?: string
  countryCode?: string
  projectType?: string
  stageCode?: string
  applicableRole?: string
  language?: string
  fileFormat?: string
  storagePath?: string
}

export interface QueryTemplateDto {
  page?: number
  pageSize?: number
  category?: string
  countryCode?: string
  projectType?: string
  language?: string
  status?: string
}

export interface CreateTemplateVersionDto {
  versionNo: string
  attachmentId?: string
  storagePath?: string
  changeNotes?: string
}
