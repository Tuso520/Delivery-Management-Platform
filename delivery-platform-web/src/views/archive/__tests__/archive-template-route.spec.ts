import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
}

describe('archive template route state', () => {
  it('uses the project-overview frame while preserving the archive workspace', () => {
    const page = source('src/domains/archive/pages/ArchiveWorkspacePage.vue')

    expect(page).toContain('<PageContainer class="archive-page" gap="normal" :scrollable="false">')
    expect(page).toContain('class="archive-metrics"')
    expect(page).toContain('class="archive-workspace"')
    expect(page).toContain('<section class="archive-toolbar">')
    expect(page).toContain('grid-template-columns: 270px minmax(937px, 1fr)')
    expect(page).toContain(':scroll="{ x: 937, y: 471 }"')
    expect(page).not.toContain('class="project-selector"')
  })

  it('loads shared template URLs through query-backed detail and version state', () => {
    const page = source('src/domains/archive/pages/ArchiveTemplatePage.vue')
    const queries = source('src/domains/archive/queries/useArchiveQueries.ts')

    expect(page).toContain('firstRouteParam(route.params.templateId)')
    expect(page).toContain("name: 'ArchiveTemplateDetail'")
    expect(page).toContain("preservedRouteQuery(route.query, ['versionId'])")
    expect(page).toContain('route.query.versionId')
    expect(page).toContain('useArchiveTemplateDetailQuery(selectedTemplateId, drawerVisible)')
    expect(queries).toContain('archiveTemplateApi.getById(toValue(templateId))')
  })

  it('matches the Figma 69:305 list contract and uses server-backed query state', () => {
    const page = source('src/domains/archive/pages/ArchiveTemplatePage.vue')
    const api = source('src/domains/archive/api/archive-template.api.ts')

    expect(page).toContain(':scroll="{ x: 1208, y: 670 }"')
    expect(page).toContain(':error="listError"')
    expect(page).toContain('@retry="templateListQuery.refetch()"')
    expect(page).toContain("toggleSort('templateName')")
    expect(page).toContain("toggleSort('currentVersion')")
    expect(page).toContain('submittedKeyword.value = searchInput.value.trim()')
    expect(page).toContain(':width="280"')
    expect(page).toContain(':width="120"')
    expect(page).toContain(':width="111"')
    expect(page).toContain(':width="95"')
    expect(page).toContain(':width="160"')
    expect(page).toContain(':width="149"')
    expect(page).toContain(':width="182"')
    expect(page).not.toContain(':title="t(\'common.status\')"')
    expect(page).not.toContain('fetchRecords')
    expect(page).not.toContain('a-pagination')
    expect(api).toContain('sortBy?: ArchiveTemplateSortField')
    expect(api).toContain('sortOrder?: ArchiveTemplateSortOrder')
  })
})
