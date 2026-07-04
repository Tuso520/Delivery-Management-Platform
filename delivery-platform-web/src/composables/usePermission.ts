import { usePermissionStore } from '@/store/permission'

export function usePermission() {
  const permissionStore = usePermissionStore()

  const hasPermission = (permission: string): boolean => {
    return permissionStore.hasPermission(permission)
  }

  const hasRole = (role: string): boolean => {
    return permissionStore.hasRole(role)
  }

  const hasAnyPermission = (permissions: string[]): boolean => {
    return permissionStore.hasAnyPermission(permissions)
  }

  const hasAllPermissions = (permissions: string[]): boolean => {
    return permissionStore.hasAllPermissions(permissions)
  }

  return {
    hasPermission,
    hasRole,
    hasAnyPermission,
    hasAllPermissions,
  }
}
