import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceRoot = resolve(process.cwd(), 'src/layouts')
const layoutSource = readFileSync(resolve(sourceRoot, 'BasicLayout.vue'), 'utf8')
const headerSource = readFileSync(resolve(sourceRoot, 'components/AppHeader.vue'), 'utf8')
const sidebarSource = readFileSync(resolve(sourceRoot, 'components/AppSidebar.vue'), 'utf8')
const loginSource = readFileSync(resolve(process.cwd(), 'src/views/login/index.vue'), 'utf8')
const logoSource = readFileSync(resolve(process.cwd(), 'src/assets/logo.svg'), 'utf8')
const faviconSource = readFileSync(resolve(process.cwd(), 'public/favicon.svg'), 'utf8')
const documentSource = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

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

  it('uses the authenticated avatar with a deterministic fallback and a focused account menu', () => {
    expect(layoutSource).toContain(':avatar-url="avatarUrl"')
    expect(headerSource).toContain(':src="avatarUrl"')
    expect(headerSource).toContain('@error="avatarLoadFailed = true"')
    expect(headerSource).toContain('class="user-avatar-fallback"')
    expect(headerSource).toContain('<span class="user-name">{{ userName }}</span>')
    expect(headerSource).toContain("t('app.profile')")
    expect(headerSource).not.toContain('v-for="item in settings"')
    expect(headerSource).not.toContain('settings: MenuItem[]')
    expect(headerSource).toContain('value="light"')
    expect(headerSource).toContain('value="dark"')
    expect(headerSource).toContain('value="system"')
    expect(headerSource).not.toContain('@arco-design/web-vue/es/icon')
    expect(headerSource).toContain('value="zh-CN"')
  })

  it('uses the blue square D as the login and browser identity', () => {
    for (const source of [logoSource, faviconSource]) {
      expect(source).toContain('fill="#165DFF"')
      expect(source).not.toContain('rx=')
      expect(source).not.toContain('#276d5c')
    }
    expect(loginSource).toContain('src="@/assets/logo.svg"')
    expect(documentSource).toContain('content="#165DFF"')
    expect(documentSource).toContain('href="/favicon.svg"')
  })

  it('renders route-derived menu expansion and an explicit empty state', () => {
    expect(sidebarSource).toContain('v-model:open-keys="openKeys"')
    expect(sidebarSource).toContain(':accordion="true"')
    expect(sidebarSource).toContain('resolveActiveMenuGroupPath(menus, activeMenu)')
    expect(sidebarSource).toContain('return t(menu.title)')
    expect(sidebarSource).not.toContain('menu.titleEn')
    expect(sidebarSource).not.toContain('menuKeyMap')
    expect(sidebarSource).toContain("t('shell.noAccessibleMenu')")
    expect(sidebarSource).toContain('resolveSidebarMenuIcon(menu)')
    expect(sidebarSource).toContain("'is-active-group': isActiveGroup(menu)")
    expect(sidebarSource).toContain(':src="resolveSidebarMenuIcon(menu).source"')
    expect(sidebarSource).toContain("{ 'is-active': isActiveGroup(menu) }")
    expect(sidebarSource).toContain("{ 'is-active': menu.path === activeMenu }")
    expect(sidebarSource).not.toContain("'--menu-icon-url'")
    expect(sidebarSource).not.toContain('mask-image')
    expect(sidebarSource).not.toContain("menu.path.includes('project')")
    expect(sidebarSource).toContain('menu-fold.svg')
  })

  it('centers menu icons, labels and chevrons with flex containers', () => {
    expect(sidebarSource).toContain('class="menu-icon-box"')
    expect(sidebarSource).toContain('class="menu-chevron-box"')
    expect(sidebarSource).toMatch(/\.menu-icon-box\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*justify-content:\s*center/s)
    expect(sidebarSource).toMatch(/\.menu-chevron-box\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*justify-content:\s*center/s)
    expect(sidebarSource).toMatch(/\.figma-menu-icon\s*\{[^}]*display:\s*block[^}]*object-fit:\s*contain[^}]*filter:/s)
    expect(sidebarSource).toMatch(/\.figma-menu-icon\.is-active\s*\{[^}]*filter:/s)
    expect(sidebarSource).toMatch(/\.menu-chevron\s*\{[^}]*display:\s*block/s)
    expect(sidebarSource).toMatch(/\.arco-menu-inline-content > \.arco-menu-item\)\s*\{[^}]*padding:\s*0 8px 0 42px/s)
    expect(sidebarSource).not.toMatch(/(?:menu-icon-box|figma-menu-icon|menu-chevron-box|menu-chevron)[^}]*?(?:margin-top|translateY|\btop\s*:)/s)
  })
})
