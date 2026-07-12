import { menuItems, settingItems } from './index'
import { findFirstAccessibleMenuPath, type MenuItem } from '@/store/permission'

function permissionedMenuTree(items: MenuItem[]): MenuItem[] {
  return items.flatMap((item) => {
    if (!item.children) return item.permissions?.length ? [item] : []

    const children = permissionedMenuTree(item.children)
    return children.length ? [{ ...item, children }] : []
  })
}

export function getFirstAccessiblePath(
  permissions: string[],
  roles: string[] = [],
): string | null {
  const explicitMainPath = findFirstAccessibleMenuPath(
    permissionedMenuTree(menuItems),
    permissions,
    roles,
  )
  if (explicitMainPath) return explicitMainPath

  const settingPath = findFirstAccessibleMenuPath(settingItems, permissions, roles)
  if (settingPath) return settingPath

  return findFirstAccessibleMenuPath(menuItems, permissions, roles)
}
