import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useUserStore } from './user'
import {
  canAccess,
  filterMenusByPermissions,
  type MenuItem,
} from '@/platform/permission/access-policy'

export {
  filterMenusByPermissions,
  findFirstAccessibleMenuPath,
  type MenuItem,
} from '@/platform/permission/access-policy'

export function resolveActiveMenuPath(menuList: MenuItem[], routePath: string): string {
  const candidatePaths: string[] = []

  const collectLeafPaths = (items: MenuItem[]): void => {
    for (const item of items) {
      if (item.children?.length) {
        collectLeafPaths(item.children)
      } else if (routePath === item.path || routePath.startsWith(`${item.path}/`)) {
        candidatePaths.push(item.path)
      }
    }
  }

  collectLeafPaths(menuList)
  return candidatePaths.sort((left, right) => right.length - left.length)[0] ?? routePath
}

export function resolveActiveMenuGroupPath(
  menuList: MenuItem[],
  activeMenuPath: string,
): string | null {
  const findParentPath = (items: MenuItem[], parentPath?: string): string | null => {
    for (const item of items) {
      if (item.path === activeMenuPath) {
        return parentPath ?? null
      }

      if (item.children?.length) {
        const matchedParentPath = findParentPath(item.children, item.path)
        if (matchedParentPath) {
          return matchedParentPath
        }
      }
    }

    return null
  }

  return findParentPath(menuList)
}

export const usePermissionStore = defineStore('permission', () => {
  const menus = ref<MenuItem[]>([])

  const hasPermission = (permission: string): boolean => {
    if (!permission) {
      return false
    }
    const userStore = useUserStore()
    const userPermissions = userStore.userInfo?.permissions ?? []
    const userRoles = userStore.userInfo?.roles ?? []
    return canAccess(
      { permissions: userPermissions, roles: userRoles },
      { all: [permission] },
    )
  }

  const hasAnyPermission = (permissions: readonly string[]): boolean => {
    if (permissions.length === 0) {
      return false
    }
    return permissions.some((permission) => hasPermission(permission))
  }

  const hasAllPermissions = (permissions: readonly string[]): boolean => {
    return permissions.every((permission) => hasPermission(permission))
  }

  const filteredMenus = computed(() => {
    const userStore = useUserStore()
    const userPermissions = userStore.userInfo?.permissions ?? []
    const userRoles = userStore.userInfo?.roles ?? []
    return filterMenusByPermissions(menus.value, userPermissions, userRoles)
  })

  const setMenus = (menuList: MenuItem[]): void => {
    menus.value = menuList
  }

  return {
    menus,
    filteredMenus,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    setMenus,
  }
})
