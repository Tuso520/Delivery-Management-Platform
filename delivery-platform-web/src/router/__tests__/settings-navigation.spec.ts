// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { settingItems, shellRoutes } from '@/router'

const routerSource = readFileSync(resolve(process.cwd(), 'src/router/index.ts'), 'utf8')

describe('settings navigation contract', () => {
  it('exposes settings center and the Figma field configuration page', () => {
    expect(settingItems.map((item) => item.title)).toEqual([
      'menu.systemCurrency',
      'menu.systemApproval',
      'menu.systemFields',
      'menu.systemIntegration',
      'menu.systemConfig',
      'menu.userCenter',
    ])
    expect(settingItems.map((item) => item.path)).toEqual([
      '/settings/currency',
      '/settings/approvals',
      '/settings/fields',
      '/settings/integrations',
      '/settings/system',
      '/settings',
    ])
  })

  it('uses target view/manage permission codes for every setting page', () => {
    const group = shellRoutes.find((route) => route.name === 'SettingsGroup')
    const permissions = Object.fromEntries(
      (group?.children ?? []).map((route) => [route.name, route.meta?.permissions]),
    )

    expect(permissions).toMatchObject({
      SettingsCenter: [
        'settings:view', 'currency:view', 'notification_rule:view', 'approval_config:view',
        'audit_log:view', 'system_setting:view', 'integration:view',
      ],
      FieldSettings: ['field_setting:manage'],
      Currency: ['currency:view', 'currency:manage'],
      Notifications: ['notification_rule:view', 'notification_rule:manage'],
      Approvals: ['approval_config:view', 'approval_config:manage'],
      Logs: ['audit_log:view'],
      SystemConfig: ['system_setting:view', 'system_setting:manage'],
      Integrations: ['integration:view', 'integration:manage'],
    })
  })

  it('checks legacy setting route permissions before forwarding to center anchors', () => {
    const group = shellRoutes.find((route) => route.name === 'SettingsGroup')
    const legacyRoutes = (group?.children ?? []).filter(
      (route) => !['SettingsCenter', 'FieldSettings'].includes(String(route.name)),
    )

    expect(legacyRoutes).toHaveLength(6)
    expect(legacyRoutes.every((route) => route.redirect === undefined)).toBe(true)
    expect(legacyRoutes.every((route) => route.beforeEnter !== undefined)).toBe(true)
  })

  it('removes retired country, language and storage management entry points', () => {
    expect(settingItems.map((item) => item.name)).not.toContain('Country')
    expect(settingItems.map((item) => item.name)).not.toContain('Language')
    expect(routerSource).not.toContain("path: 'global/country'")
    expect(routerSource).not.toContain("path: 'global/language'")
    expect(routerSource).not.toContain("path: 'operations/storage'")
  })
})
