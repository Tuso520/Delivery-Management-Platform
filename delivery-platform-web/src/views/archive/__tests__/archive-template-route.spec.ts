import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
}

describe('archive template route state', () => {
  it('uses the project-overview frame while preserving the archive workspace', () => {
    const page = source('src/views/archive/index.vue')

    expect(page).toContain('<PageContainer class="archive-page" gap="compact" :scrollable="false">')
    expect(page).toContain('<section class="summary-grid">')
    expect(page).toContain('<section class="archive-workspace-panel">')
    expect(page).toContain('<PageToolbar class="archive-toolbar">')
    expect(page).toContain('fixed="left"')
    expect(page).not.toContain('class="project-selector"')
  })

  it('loads shared template URLs through query-backed detail and version state', () => {
    const page = source('src/views/archive/template.vue')
    const queries = source('src/composables/queries/useArchiveQueries.ts')

    expect(page).toContain('firstRouteParam(route.params.templateId)')
    expect(page).toContain("name: 'ArchiveTemplateDetail'")
    expect(page).toContain("preservedRouteQuery(route.query, ['versionId'])")
    expect(page).toContain('route.query.versionId')
    expect(page).toContain('useArchiveTemplateDetailQuery(selectedTemplateId, drawerVisible)')
    expect(queries).toContain('archiveTemplateApi.getById(toValue(templateId))')
  })
})
