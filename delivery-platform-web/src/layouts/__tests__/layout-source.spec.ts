import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceRoot = resolve(process.cwd(), 'src/layouts')
const layoutSource = readFileSync(resolve(sourceRoot, 'BasicLayout.vue'), 'utf8')
const headerSource = readFileSync(resolve(sourceRoot, 'components/AppHeader.vue'), 'utf8')
const sidebarSource = readFileSync(resolve(sourceRoot, 'components/AppSidebar.vue'), 'utf8')

describe('application shell layout', () => {
  it('uses the target 48px header and 240px/64px sidebar', () => {
    expect(headerSource).toMatch(/\.layout-header\s*\{[^}]*height:\s*48px/s)
    expect(headerSource).toMatch(/\.layout-header\s*\{[^}]*flex:\s*0 0 48px/s)
    expect(sidebarSource).toMatch(/\.layout-aside\s*\{[^}]*width:\s*240px/s)
    expect(sidebarSource).toMatch(/&\.collapsed\s*\{[^}]*width:\s*64px/s)
  })

  it('uses a full-width responsive content area without a max width', () => {
    expect(layoutSource).toMatch(/\.layout-main\s*\{[^}]*width:\s*100%/s)
    expect(layoutSource).toMatch(/\.layout-main\s*\{[^}]*min-height:\s*0/s)
    expect(layoutSource).not.toMatch(/[;{]\s*max-width\s*:/u)
    expect(layoutSource).toContain('padding: 24px')
    expect(layoutSource).toContain('padding: 12px')
  })

  it('shows title only and removes header descriptions and breadcrumbs', () => {
    expect(headerSource).toMatch(/<h1 class="page-title">\s*\{\{ pageTitle \}\}\s*<\/h1>/u)
    expect(headerSource).not.toContain('pageDescription')
    expect(headerSource).not.toContain('a-breadcrumb')
    expect(layoutSource).not.toContain('pageDescriptionMap')
  })

  it('keeps the settings gear visible and offers language and three theme modes', () => {
    expect(headerSource).toContain('<IconSettings />')
    expect(headerSource).toContain('<span class="sr-only">{{ t(\'shell.openSettings\') }}</span>')
    expect(headerSource).toContain("value: 'light'")
    expect(headerSource).toContain("value: 'dark'")
    expect(headerSource).toContain("value: 'system'")
    expect(headerSource).toContain('<IconLanguage />')
    expect(headerSource).toContain('{{ currentLocaleLabel }}')
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
