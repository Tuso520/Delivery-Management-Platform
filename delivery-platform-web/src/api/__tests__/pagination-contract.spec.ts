import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PAGINATION_CONSUMERS = [
  'src/views/system/user/index.vue',
  'src/views/organization/departments.vue',
  'src/views/system/integrations.vue',
  'src/views/system/approvals.vue',
  'src/domains/archive/pages/ArchiveWorkspacePage.vue',
  'src/domains/archive/pages/ArchiveTemplatePage.vue',
  'src/domains/project/components/ProjectDetailDialog.vue',
  'src/domains/project/pages/ProjectOverviewPage.vue',
  'src/views/review/pending.vue',
  'src/views/standard/index.vue',
  'src/domains/knowledge/pages/KnowledgePage.vue',
] as const

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('frontend canonical pagination contract', () => {
  it('defines only items/page/pageSize/total', () => {
    const source = readSource('src/types/api.ts')

    expect(source).toContain('items: T[]')
    expect(source).toContain('page: number')
    expect(source).toContain('pageSize: number')
    expect(source).toContain('total: number')
    expect(source).not.toContain('totalPages')
    expect(source).not.toMatch(/\blist:\s*T\[\]/)
    expect(source).not.toMatch(/\bpagination:/)
  })

  it.each(PAGINATION_CONSUMERS)('%s consumes no legacy pagination keys', (path) => {
    const source = readSource(path)

    expect(source).not.toMatch(/(?:data(?:\.value)?|res|userPage)\?*\.(?:list|pagination)\b/)
    expect(source).not.toContain('totalPages')
  })
})
