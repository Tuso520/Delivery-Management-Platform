import type { RoleCode } from './access-control.generated'

export interface AccessSubject {
  permissions: readonly string[]
  roles: readonly string[]
}

export interface PermissionRequirement {
  all?: readonly string[]
  any?: readonly string[]
}

export interface MenuItem {
  path: string
  name: string
  title: string
  icon?: string
  permissions?: readonly string[]
  children?: MenuItem[]
}

export function canAccess(
  subject: AccessSubject,
  requirement: PermissionRequirement = {},
): boolean {
  if (subject.roles.includes('SUPER_ADMIN' satisfies RoleCode)) return true

  const all = requirement.all ?? []
  const any = requirement.any ?? []
  const hasAll = all.every((permission) => subject.permissions.includes(permission))
  const hasAny = any.length === 0 || any.some((permission) => subject.permissions.includes(permission))
  return hasAll && hasAny
}

export function filterMenusByPermissions(
  menuList: readonly MenuItem[],
  userPermissions: readonly string[],
  userRoles: readonly string[] = [],
): MenuItem[] {
  const subject = { permissions: userPermissions, roles: userRoles }

  return menuList.flatMap((menu) => {
    const filteredChildren = menu.children
      ? filterMenusByPermissions(menu.children, userPermissions, userRoles)
      : undefined
    const canAccessSelf =
      !menu.permissions?.length || canAccess(subject, { any: menu.permissions })
    const hasAccessibleChildren = Boolean(filteredChildren?.length)

    if (!canAccessSelf || (menu.children && !hasAccessibleChildren)) return []

    return [
      {
        ...menu,
        ...(menu.children ? { children: filteredChildren } : {}),
      },
    ]
  })
}

export function findFirstAccessibleMenuPath(
  menuList: readonly MenuItem[],
  userPermissions: readonly string[],
  userRoles: readonly string[] = [],
): string | null {
  const accessibleMenus = filterMenusByPermissions(menuList, userPermissions, userRoles)

  const findPath = (items: readonly MenuItem[]): string | null => {
    for (const item of items) {
      if (item.children?.length) {
        const childPath = findPath(item.children)
        if (childPath) return childPath
      } else {
        return item.path
      }
    }
    return null
  }

  return findPath(accessibleMenus)
}
