import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
}

describe('archive template route state', () => {
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
