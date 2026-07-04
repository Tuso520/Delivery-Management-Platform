import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('platform refinement regression', () => {
  it('keeps the dashboard in the required business order', () => {
    const source = readSource('src/views/dashboard/index.vue')
    expect(source.indexOf('<PaymentOverview')).toBeLessThan(
      source.indexOf('<StageDistribution'),
    )
    expect(source.indexOf('我的项目')).toBeLessThan(
      source.indexOf('<RecentProjects'),
    )
    expect(source).not.toContain('待办事项')
  })

  it('keeps project records inside project archives', () => {
    const router = readSource('src/router/index.ts')
    const archive = readSource('src/views/archive/index.vue')
    expect(router).toContain("{ path: 'process-records', redirect: '/archive' }")
    expect(archive).toContain('ProjectRecordsPanel')
    expect(archive).toContain('上传记录')
  })

  it('uses the light Arco-inspired design tokens', () => {
    const variables = readSource('src/styles/variables.scss')
    const sidebar = readSource('src/layouts/components/AppSidebar.vue')
    expect(variables).toContain('$color-primary: #165dff')
    expect(variables).toContain('$color-bg-page: #f7f8fa')
    expect(sidebar).toContain('background: var(--color-bg-2)')
  })
})
