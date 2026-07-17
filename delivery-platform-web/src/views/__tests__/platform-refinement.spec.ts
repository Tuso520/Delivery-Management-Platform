import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('platform refinement regression', () => {
  it('keeps the dashboard on the five target partitions with isolated queries', () => {
    const source = readSource('src/views/dashboard/index.vue')
    const api = readSource('src/api/dashboard.ts')
    const queries = readSource('src/composables/queries/useDashboardQueries.ts')
    expect(source.indexOf("t('dashboard.overview')")).toBeLessThan(
      source.indexOf("t('dashboard.myTasks')"),
    )
    expect(source.indexOf("t('dashboard.myTasks')")).toBeLessThan(
      source.indexOf("t('dashboard.highRiskProjects')"),
    )
    expect(source.indexOf("t('dashboard.highRiskProjects')")).toBeLessThan(
      source.indexOf("t('dashboard.recentProjects')"),
    )
    expect(source.indexOf("t('dashboard.recentProjects')")).toBeLessThan(
      source.indexOf("t('dashboard.recentActivities')"),
    )
    expect(source).not.toContain('PaymentOverview')
    expect(source).not.toContain('onMounted')
    expect(queries.match(/useQuery\(/g)).toHaveLength(5)
    expect(api).not.toContain('/dashboard/overview')
  })

  it('uses the target two-level project archive snapshot', () => {
    const router = readSource('src/router/index.ts')
    const archive = readSource('src/views/archive/index.vue')
    const archiveApi = readSource('src/api/archive.ts')
    expect(router).not.toContain("path: 'process-records'")
    expect(archive).toContain('ProjectArchiveTargetFolder')
    expect(archiveApi).toContain('archive-template-sync')
    expect(archive).not.toContain('LEGACY_READ_ONLY')
    expect(archive).not.toContain('migrationMode')
    expect(archive).not.toContain('ProjectRecordsPanel')
  })

  it('uses the light Arco-inspired design tokens', () => {
    const variables = readSource('src/styles/variables.scss')
    const sidebar = readSource('src/layouts/components/AppSidebar.vue')
    expect(variables).toContain('$color-primary: #165dff')
    expect(variables).toContain('$color-bg-page: #f7f8fa')
    expect(sidebar).toContain('background: var(--color-bg-2)')
  })

  it('uses filterable category statistics and an infinite tool card grid', () => {
    const tools = readSource('src/views/tools/index.vue')

    expect(tools).toContain('<section class="category-summary-grid"')
    expect(tools).toContain('<StatCard')
    expect(tools).toContain('interactive')
    expect(tools).toContain('v-for="tool in renderedTools"')
    expect(tools).toContain('visibleToolCount.value + 20')
    expect(tools).toContain('column-gap: 24px')
    expect(tools).toContain('row-gap: 20px')
    expect(tools).not.toContain('class="category-panel"')
  })
})
