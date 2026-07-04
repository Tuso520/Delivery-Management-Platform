export interface UserInfo {
  id: string
  username: string
  realName: string
  email: string
  avatar?: string
  roles: string[]
  permissions: string[]
}

export interface LoginForm {
  username: string
  password: string
}

export interface LoginResult {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
}

export interface UserProfile {
  id?: string
  sub?: string
  username: string
  realName: string
  email: string | null
  avatar?: string
  roles: string[]
  permissions: string[]
  createdAt?: string
  updatedAt?: string
}

// ============ User Management Types ============

export interface UserListItem {
  id: string
  username: string
  realName: string
  email: string | null
  phone: string | null
  departmentId: string | null
  status: string
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  roles: UserRoleItem[]
}

export interface UserRoleItem {
  id: string
  roleCode: string
  roleName: string
}

export interface CreateUserDto {
  username: string
  password: string
  realName: string
  email?: string
  phone?: string
  departmentId?: string
}

export interface UpdateUserDto {
  realName?: string
  email?: string
  phone?: string
  departmentId?: string
}

export interface QueryUserParams {
  page?: number
  pageSize?: number
  keyword?: string
  status?: string
  departmentId?: string
}

export interface AssignRolesDto {
  roleIds: string[]
}

export interface ResetPasswordDto {
  newPassword: string
}
