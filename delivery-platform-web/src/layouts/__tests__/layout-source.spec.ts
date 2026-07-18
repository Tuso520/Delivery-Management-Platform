import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceRoot = resolve(process.cwd(), 'src/layouts')
const layoutSource = readFileSync(resolve(sourceRoot, 'BasicLayout.vue'), 'utf8')
const headerSource = readFileSync(resolve(sourceRoot, 'components/AppHeader.vue'), 'utf8')
const sidebarSource = readFileSync(resolve(sourceRoot, 'components/AppSidebar.vue'), 'utf8')

describe('application shell layout', () => {
  it('uses the Figma 60px header and 180px/48px sidebar', () => {
    expect(headerSource).toMatch(/\.layout-header\s*\{[^}]*height:\s*60px/s)
    expect(headerSource).toMatch(/\.layout-header\s*\{[^}]*flex:\s*0 0 60px/s)
    expect(sidebarSource).toMatch(/\.layout-aside\s*\{[^}]*width:\s*180px/s)
    expect(sidebarSource).toMatch(/&\.collapsed\s*\{[^}]*width:\s*48px/s)
  })

  it('uses a full-width responsive content area without a max width', () => {
    expect(layoutSource).toMatch(/\.layout-main\s*\{[^}]*width:\s*100%/s)
    expect(layoutSource).toMatch(/\.layout-main\s*\{[^}]*min-height:\s*0/s)
    expect(layoutSource).not.toMatch(/[;{]\s*max-width\s*:/u)
    expect(layoutSource).toContain('padding: 13px')
    expect(layoutSource).toContain('border-radius: 4px')
  })

  it('renders the full-width brand header and route-derived breadcrumb', () => {
    expect(headerSource).toContain("t('shell.productTitle')")
    expect(headerSource).toContain('class="brand-mark"')
    expect(layoutSource).toContain('<AppBreadcrumb')
    expect(layoutSource).toContain(':group-title="groupTitle"')
  })

  it('keeps notification, settings, locale and theme capabilities available', () => {
    expect(headerSource).toContain('<IconNotification />')
    expect(headerSource).toContain('<IconSettings />')
    expect(headerSource).toContain('<span class="sr-only">{{ t(\'shell.openSettings\') }}</span>')
    expect(headerSource).toContain('value="light"')
    expect(headerSource).toContain('value="dark"')
    expect(headerSource).toContain('value="system"')
    expect(headerSource).toContain('<IconLanguage />')
    expect(headerSource).toContain('value="zh-CN"')
  })

  it('renders route-derived menu expansion and an explicit empty state', () => {
    expect(sidebarSource).toContain(':default-open-keys="defaultOpenKeys"')
    expect(sidebarSource).toContain(':accordion="true"')
    expect(sidebarSource).toContain('return t(menu.title)')
    expect(sidebarSource).not.toContain('menu.titleEn')
    expect(sidebarSource).not.toContain('menuKeyMap')
    expect(sidebarSource).toContain("t('shell.noAccessibleMenu')")
  })
})
