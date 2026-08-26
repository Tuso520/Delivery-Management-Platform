export interface Role {
  id: string
  roleCode: string
  roleName: string
  description: string | null
  status: string
  isProtected: boolean
  userCount: number
  permissionCount: number
  createdAt: string
  updatedAt: string
}

export interface RoleDetail extends Omit<Role, 'userCount' | 'permissionCount'> {
  permissions: Permission[]
}

export interface Permission {
  id: string
  permissionCode: string
  permissionName: string
  resource: string
  action: string
  moduleCode?: string
  moduleName?: string
  pageCode?: string
  pageName?: string
  actionGroup: 'VIEW' | 'OPERATE' | 'TRANSFER' | 'DELETE'
  restrictedToSystemAdministrator?: boolean
  sortOrder?: number
  description: string | null
  createdAt: string
}

export interface PermissionPage {
  pageCode: string
  pageName: string
  permissions: Permission[]
}

export interface PermissionModule {
  moduleCode: string
  moduleName: string
  pages: PermissionPage[]
}

export interface CreateRoleDto {
  roleCode: string
  roleName: string
  description?: string
}

export interface UpdateRoleDto {
  roleName?: string
  description?: string
  status?: string
}

export interface AssignPermissionsDto {
  permissionIds: string[]
}
