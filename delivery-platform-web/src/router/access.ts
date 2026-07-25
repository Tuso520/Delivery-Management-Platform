import {
  findFirstAccessibleMenuPath,
  type MenuItem,
} from '@/platform/permission/access-policy'

export function getFirstAccessiblePath(
  menuItems: readonly MenuItem[],
  permissions: readonly string[],
  roles: readonly string[] = [],
): string | null {
  const protectedMenus = menuItems.flatMap((item): MenuItem[] => {
    if (!item.children) return item.permissions?.length ? [item] : []
    const children = item.children.filter((child) => child.permissions?.length)
    return children.length > 0 ? [{ ...item, children }] : []
  })
  return (
    findFirstAccessibleMenuPath(protectedMenus, permissions, roles) ??
    findFirstAccessibleMenuPath(menuItems, permissions, roles)
  )
}
