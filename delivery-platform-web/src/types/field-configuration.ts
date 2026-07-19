export interface FieldCategory {
  id: string
  categoryCode: string
  categoryName: string
  description: string | null
  sortOrder: number
  isSystem: boolean
  status: string
  createdAt: string
  updatedAt: string
  _count: { items: number }
}

export interface FieldValue {
  id: string
  categoryId: string
  value: string
  name: string
  code: string | null
  sortOrder: number
  status: 'Active' | 'Inactive'
  isSystemDefault: boolean
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface SaveFieldValueDto {
  name: string
  code?: string
  sortOrder?: number
  status?: FieldValue['status']
}

export interface FieldReferenceStatus {
  referenced: boolean
  total: number
  sources: Array<{ module: string; count: number }>
}

export interface EnabledFieldOptions {
  code: string
  name: string
  values: Array<{ id: string; value: string; name: string; code: string | null; sortOrder: number }>
}
