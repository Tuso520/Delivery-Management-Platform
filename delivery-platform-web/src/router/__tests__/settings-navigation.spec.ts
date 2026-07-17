// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { settingItems, shellRoutes } from '@/router'

const routerSource = readFileSync(resolve(process.cwd(), 'src/router/index.ts'), 'utf8')

describe('settings navigation contract', () => {
  it('exposes one unified settings center behind the header settings surface', () => {
    expect(settingItems.map((item) => item.title)).toEqual(['routes.settings'])
    expect(settingItems.map((item) => item.path)).toEqual(['/settings'])
  })

  it('uses target view/manage permission codes for every setting page', () => {
    const group = shellRoutes.find((route) => route.name === 'SettingsGroup')
    const permissions = Object.fromEntries(
      (group?.children ?? []).map((route) => [route.name, route.meta?.permissions]),
    )

    expect(permissions).toMatchObject({
      SettingsCenter: [
        'settings:view', 'currency:view', 'notification_rule:view', 'approval_config:view',
        'audit_log:view', 'system_setting:view', 'integration:view', 'field_setting:manage',
      ],
      Currency: ['currency:view', 'currency:manage'],
      Notifications: ['notification_rule:view', 'notification_rule:manage'],
      Approvals: ['approval_config:view', 'approval_config:manage'],
      Logs: ['audit_log:view'],
      SystemConfig: ['system_setting:view', 'system_setting:manage'],
      Integrations: ['integration:view', 'integration:manage'],
    })
  })

  it('removes retired country, language and storage management entry points', () => {
    expect(settingItems.map((item) => item.name)).not.toContain('Country')
    expect(settingItems.map((item) => item.name)).not.toContain('Language')
    expect(routerSource).not.toContain("path: 'global/country'")
    expect(routerSource).not.toContain("path: 'global/language'")
    expect(routerSource).not.toContain("path: 'operations/storage'")
  })
})
