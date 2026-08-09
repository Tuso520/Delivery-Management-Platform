import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(resolve(process.cwd(), 'src/views/system/user/index.vue'), 'utf8')
const styleSource = readFileSync(resolve(process.cwd(), 'src/views/system/user/index.scss'), 'utf8')

describe('user center page layout', () => {
  it('owns one constrained vertical viewport while retaining remote page loading', () => {
    expect(pageSource).toContain('<PageContainer class="user-page" :scrollable="false">')
    expect(pageSource).toContain(':pagination="pagination"')
    expect(pageSource).toContain('@page-change="handlePageChange"')
    expect(styleSource).toMatch(/\.user-page\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s)
    expect(styleSource).toMatch(/\.table-card\s*\{[^}]*min-height:\s*0[^}]*flex:\s*1 1 auto/s)
    expect(styleSource).toMatch(
      /\.table-card :deep\(\.business-table__viewport\)\s*\{[^}]*height:\s*100%[^}]*max-height:\s*none[^}]*overflow:\s*auto/s,
    )
  })
})
