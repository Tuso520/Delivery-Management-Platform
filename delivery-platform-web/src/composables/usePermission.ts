import { usePermissionStore } from '@/store/permission'

export function usePermission() {
  const permissionStore = usePermissionStore()

  const hasPermission = (permission: string): boolean => {
    return permissionStore.hasPermission(permission)
  }

  const hasAnyPermission = (permissions: string[]): boolean => {
    return permissionStore.hasAnyPermission(permissions)
  }

  const hasAllPermissions = (permissions: string[]): boolean => {
    return permissionStore.hasAllPermissions(permissions)
  }

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  }
}
