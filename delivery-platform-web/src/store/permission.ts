import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useUserStore } from './user'

export interface MenuItem {
  path: string
  name: string
  title: string
  icon?: string
  permissions?: string[]
  children?: MenuItem[]
}

export function filterMenusByPermissions(
  menuList: MenuItem[],
  userPermissions: string[],
  userRoles: string[] = [],
): MenuItem[] {
  if (userRoles.includes('SUPER_ADMIN')) {
    return menuList
  }

  return menuList.flatMap((menu) => {
    const filteredChildren = menu.children
      ? filterMenusByPermissions(menu.children, userPermissions, userRoles)
      : undefined
    const canAccessSelf =
      !menu.permissions?.length ||
      menu.permissions.some((permission) => userPermissions.includes(permission))
    const hasAccessibleChildren = Boolean(filteredChildren?.length)

    if (!canAccessSelf || (menu.children && !hasAccessibleChildren)) {
      return []
    }

    return [
      {
        ...menu,
        ...(menu.children ? { children: filteredChildren } : {}),
      },
    ]
  })
}

export function findFirstAccessibleMenuPath(
  menuList: MenuItem[],
  userPermissions: string[],
  userRoles: string[] = [],
): string | null {
  const accessibleMenus = filterMenusByPermissions(menuList, userPermissions, userRoles)

  const findPath = (items: MenuItem[]): string | null => {
    for (const item of items) {
      if (item.children?.length) {
        const childPath = findPath(item.children)
        if (childPath) {
          return childPath
        }
      } else {
        return item.path
      }
    }

    return null
  }

  return findPath(accessibleMenus)
}

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

export const usePermissionStore = defineStore('permission', () => {
  const menus = ref<MenuItem[]>([])

  const hasPermission = (permission: string): boolean => {
    if (!permission) {
      return false
    }
    const userStore = useUserStore()
    const userPermissions = userStore.userInfo?.permissions ?? []
    const userRoles = userStore.userInfo?.roles ?? []
    return userRoles.includes('SUPER_ADMIN') || userPermissions.includes(permission)
  }

  const hasAnyPermission = (permissions: string[]): boolean => {
    if (permissions.length === 0) {
      return false
    }
    return permissions.some((permission) => hasPermission(permission))
  }

  const hasAllPermissions = (permissions: string[]): boolean => {
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
