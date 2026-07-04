import { describe, expect, it, vi } from 'vitest'
import {
  filterMenusByPermissions,
  findFirstAccessibleMenuPath,
  resolveActiveMenuPath,
} from '@/store/permission'
import type { MenuItem } from '@/store/permission'

vi.mock('@/store/user', () => ({
  useUserStore: () => ({
    userInfo: {
      roles: [],
      permissions: [],
    },
  }),
}))

const groupedMenus: MenuItem[] = [
  {
    path: '/workspace',
    name: 'Workspace',
    title: '工作台',
    children: [
      {
        path: '/dashboard',
        name: 'Dashboard',
        title: '数据看板',
        permissions: ['dashboard:view'],
      },
      {
        path: '/todos',
        name: 'Todos',
        title: '我的待办',
        permissions: ['todo:view'],
      },
    ],
  },
  {
    path: '/system',
    name: 'System',
    title: '系统设置',
    children: [
      {
        path: '/system/config',
        name: 'SystemConfig',
        title: '系统参数',
        permissions: ['system:manage_config'],
      },
    ],
  },
]

describe('filterMenusByPermissions', () => {
  it('keeps a group when at least one child is accessible', () => {
    const result = filterMenusByPermissions(groupedMenus, ['dashboard:view'])

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Workspace')
    expect(result[0].children?.map((item) => item.name)).toEqual(['Dashboard'])
  })

  it('shows all menu groups for super administrators', () => {
    const result = filterMenusByPermissions(groupedMenus, [], ['SUPER_ADMIN'])

    expect(result).toEqual(groupedMenus)
  })

  it('returns the first accessible child route for a regular user', () => {
    expect(
      findFirstAccessibleMenuPath(groupedMenus, ['todo:view']),
    ).toBe('/todos')
  })

  it('returns the first menu route for super administrators without explicit permissions', () => {
    expect(
      findFirstAccessibleMenuPath(groupedMenus, [], ['SUPER_ADMIN']),
    ).toBe('/dashboard')
  })

  it('returns null when no menu is accessible', () => {
    expect(findFirstAccessibleMenuPath(groupedMenus, [])).toBeNull()
  })

  it('keeps a parent list menu active on hidden detail routes', () => {
    const projectMenus: MenuItem[] = [
      {
        path: '/delivery',
        name: 'Delivery',
        title: '项目管理',
        children: [
          {
            path: '/project',
            name: 'Project',
            title: '项目台账',
            permissions: ['project:view'],
          },
        ],
      },
    ]

    expect(
      resolveActiveMenuPath(projectMenus, '/project/detail/project-1'),
    ).toBe('/project')
  })
})
