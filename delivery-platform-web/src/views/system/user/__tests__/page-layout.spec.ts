import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(resolve(process.cwd(), 'src/views/system/user/index.vue'), 'utf8')
const dialogSource = readFileSync(
  resolve(process.cwd(), 'src/views/system/user/UserFormDialog.vue'),
  'utf8',
)
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

  it('shows the display name as the username without exposing the login account in the list', () => {
    expect(pageSource).toContain('data-index="realName" title="用户名"')
    expect(pageSource).not.toContain('data-index="username"')
    expect(pageSource).not.toContain('currentUserForRole.username')
    expect(pageSource).not.toContain('row.realName}(${row.username})')
    expect(pageSource).toContain('placeholder="用户名/邮箱"')
  })

  it('only requests the login account while creating a user', () => {
    expect(dialogSource).toContain('v-if="!isEdit" label="登录账号" field="username"')
    expect(dialogSource).toContain('label="用户名" field="realName"')
    expect(dialogSource).not.toContain('label="真实姓名"')
  })
})
