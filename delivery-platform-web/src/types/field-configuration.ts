export interface FieldCategory {
  id: string
  categoryCode: string
  categoryName: string
  fieldType: FieldType
  required: boolean
  defaultValue: unknown
  visibleScopes: string[]
  permissions: FieldPermissions
  revision: number
  description: string | null
  sortOrder: number
  isSystem: boolean
  status: string
  createdAt: string
  updatedAt: string
  _count: { items: number }
}

export type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'SINGLE_SELECT' | 'MULTI_SELECT' | 'BOOLEAN'

export interface FieldPermissions {
  view?: string[]
  edit?: string[]
}

export interface FieldOption {
  id: string
  label: string
  value: string
  code: string | null
  description: string | null
  sort: number
  enabled: boolean
}

export interface FieldConfiguration {
  id: string
  fieldCode: string
  fieldName: string
  fieldType: FieldType
  required: boolean
  enabled: boolean
  defaultValue: unknown
  sort: number
  options: FieldOption[]
  visibleScopes: string[]
  permissions: FieldPermissions
  description: string | null
  revision: number
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface SaveFieldConfigurationDto {
  fieldCode: string
  fieldName: string
  fieldType: FieldType
  required?: boolean
  enabled?: boolean
  defaultValue?: unknown
  sort?: number
  visibleScopes?: string[]
  permissions?: FieldPermissions
  description?: string
}

export interface FieldConfigurationVersion {
  version: string
  revision: number
  updatedAt: string | null
}

export interface FieldValue {
  id: string
  categoryId: string
  value: string
  name: string
  code: string | null
  description: string | null
  metadata: unknown
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
  description?: string
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
  fieldType: FieldType
  required: boolean
  enabled: boolean
  defaultValue: unknown
  visibleScopes: string[]
  permissions: FieldPermissions
  revision: number
  updatedAt: string
  values: Array<{
    id: string
    value: string
    name: string
    code: string | null
    sortOrder: number
    enabled: boolean
  }>
}
