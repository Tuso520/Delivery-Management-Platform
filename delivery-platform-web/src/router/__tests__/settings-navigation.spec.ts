// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { settingItems, shellRoutes } from '@/router'

const routerSource = readFileSync(resolve(process.cwd(), 'src/router/index.ts'), 'utf8')

describe('settings navigation contract', () => {
  it('exposes one page for each settings business directory', () => {
    expect(settingItems.map((item) => item.title)).toEqual([
      'menu.systemCurrency',
      'menu.systemApproval',
      'menu.systemFields',
      'menu.systemConfig',
      'menu.documentPreview',
      'menu.userCenter',
      'menu.rolePermissions',
      'menu.systemIntegration',
    ])
    expect(settingItems.map((item) => item.path)).toEqual([
      '/settings/currency',
      '/settings/approvals',
      '/settings/fields',
      '/settings/system',
      '/settings/document-preview',
      '/settings',
      '/settings/role-permissions',
      '/settings/integrations',
    ])
  })

  it('uses target view/manage permission codes for every setting page', () => {
    const group = shellRoutes.find((route) => route.name === 'SettingsGroup')
    const permissions = Object.fromEntries(
      (group?.children ?? []).map((route) => [route.name, route.meta?.permissions]),
    )

    expect(permissions).toMatchObject({
      UserCenter: ['user:view'],
      FieldSettings: ['field_setting:view'],
      Currency: ['currency:view', 'currency:manage'],
      Notifications: ['notification_rule:view', 'notification_rule:manage'],
      Approvals: ['approval_config:view', 'approval_config:manage'],
      SystemConfig: ['system_setting:view', 'system_setting:manage'],
      DocumentPreviewSettings: ['system_setting:view', 'system_setting:manage'],
      Integrations: ['integration:view', 'integration:manage'],
    })
    expect(
      (group?.children ?? []).find((route) => route.name === 'RolePermissions')?.meta?.roles,
    ).toEqual(['SUPER_ADMIN'])
  })

  it('loads each settings route with its own page component', () => {
    const group = shellRoutes.find((route) => route.name === 'SettingsGroup')
    const settingRoutes = group?.children ?? []

    expect(settingRoutes).toHaveLength(9)
    expect(settingRoutes.every((route) => route.component !== undefined)).toBe(true)
    expect(settingRoutes.every((route) => route.beforeEnter === undefined)).toBe(true)
    expect(settingRoutes.map((route) => route.name)).not.toContain('Logs')
  })

  it('removes retired country, language and storage management entry points', () => {
    expect(settingItems.map((item) => item.name)).not.toContain('Country')
    expect(settingItems.map((item) => item.name)).not.toContain('Language')
    expect(routerSource).not.toContain("path: 'global/country'")
    expect(routerSource).not.toContain("path: 'global/language'")
    expect(routerSource).not.toContain("path: 'operations/storage'")
  })
})
