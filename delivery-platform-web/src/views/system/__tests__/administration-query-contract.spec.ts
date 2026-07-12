import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('administration server-state contract', () => {
  const pagePaths = [
    'src/views/currency/index.vue',
    'src/views/system/user/index.vue',
    'src/views/system/role/index.vue',
    'src/views/organization/departments.vue',
  ]

  it('uses Query reads and mutations instead of mount-time API state', () => {
    const queries = readSource('src/composables/queries/useAdministrationQueries.ts')
    expect(queries.match(/useQuery\(/gu)).toHaveLength(7)
    expect(queries).toContain('queryKeys.users.list')
    expect(queries).toContain('queryKeys.roles.detail')
    expect(queries).toContain('queryKeys.departments.tree')

    for (const path of pagePaths) {
      const source = readSource(path)
      expect(source).not.toContain('onMounted')
      expect(source).toContain('useMutation')
      expect(source).toContain('useAdministrationQueries')
    }

    const login = readSource('src/views/login/index.vue')
    expect(login).not.toContain('onMounted')
    expect(login).toContain('usePublicSystemConfigQuery')
  })

  it('renders shared business components in real administration pages', () => {
    for (const path of pagePaths) {
      const source = readSource(path)
      expect(source).toContain('<PageContainer')
      expect(source).toContain('<PageToolbar')
      expect(source).toContain('<BusinessTable')
      expect(source).toContain('<StatusBadge')
      expect(source).toContain('<Can')
    }

    expect(readSource('src/views/currency/index.vue')).toContain('<BusinessModal')
    expect(readSource('src/views/system/user/UserFormDialog.vue')).toContain('<BusinessDrawer')
  })
})
