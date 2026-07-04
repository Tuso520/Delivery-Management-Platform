import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const sourceRoot = resolve(process.cwd(), 'src/layouts')

describe('application shell layout', () => {
  it('uses an explicit vertical content container', () => {
    const source = readFileSync(resolve(sourceRoot, 'BasicLayout.vue'), 'utf8')

    expect(source).toContain('<div class="layout-content">')
    expect(source).toMatch(/\.layout-content\s*\{[^}]*display:\s*flex/s)
    expect(source).toMatch(/\.layout-content\s*\{[^}]*flex-direction:\s*column/s)
    expect(source).toMatch(/\.layout-content\s*\{[^}]*width:\s*0/s)
    expect(source).toMatch(/\.layout-content\s*\{[^}]*min-height:\s*0/s)
  })

  it('keeps the main content inside the available shell area', () => {
    const source = readFileSync(resolve(sourceRoot, 'BasicLayout.vue'), 'utf8')

    expect(source).toMatch(/\.layout-main\s*\{[^}]*width:\s*100%/s)
    expect(source).toMatch(/\.layout-main\s*\{[^}]*min-height:\s*0/s)
  })

  it('renders menu expansion and an explicit empty state', () => {
    const source = readFileSync(
      resolve(sourceRoot, 'components/AppSidebar.vue'),
      'utf8',
    )

    expect(source).toContain(':default-open-keys="defaultOpenKeys"')
    expect(source).toContain('<a-menu')
    expect(source).toContain('class="menu-empty"')
    expect(source).toContain('当前账号暂无可访问菜单')
  })
})
