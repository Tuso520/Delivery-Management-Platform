export interface DictionaryItem {
  id: string
  itemValue: string
  itemLabel: string
  status: string
  sortOrder: number
  extraData?: Record<string, unknown>
}

export interface DictionaryCategory {
  id: string
  categoryCode: string
  categoryName: string
  description?: string
  items: DictionaryItem[]
}

export interface RoleOption {
  id: string
  roleCode: string
  roleName: string
}

export interface DepartmentNode {
  id: string
  departmentCode: string
  departmentName: string
  parentId?: string
  managerId?: string
  status: string
  sortOrder: number
  manager?: { id: string; realName: string }
  userCount: number
  children: DepartmentNode[]
}
