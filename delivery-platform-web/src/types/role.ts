export interface Role {
  id: string
  roleCode: string
  roleName: string
  description: string | null
  status: string
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
  actionGroup?: 'view' | 'download' | 'upload' | 'operate'
  description: string | null
  createdAt: string
}

export interface PermissionGroup {
  resource: string
  permissions: Permission[]
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
