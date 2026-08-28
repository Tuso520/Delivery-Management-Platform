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
    expect(queries.match(/useQuery\(/gu)).toHaveLength(8)
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

  it('loads one isolated permission snapshot per dialog session so refreshes cannot undo selections', () => {
    const source = readSource('src/views/system/role/index.vue')
    expect(source).toContain('const permissionModules = shallowRef<PermissionModule[]>([])')
    expect(source).toContain('const session = ++permissionSession')
    expect(source).toContain('session !== permissionSession')
    expect(source).toContain('queryClient.cancelQueries')
    expect(source).not.toContain('watch(')
    expect(source).not.toContain('<a-spin :loading="permTreeLoading"')
    expect(source).toContain(':columns="permissionMatrixColumns"')
    expect(source).toContain('row-key="id"')
    expect(source).toContain('restrictedToSystemAdministrator')
    expect(source).not.toContain('<a-table-column title="页面 / 功能"')

    expect(source).toContain('queryFn: ({ signal }) => roleApi.getById(row.id, signal)')
  })

  it('keeps the permission matrix inside one vertical viewport without horizontal overflow', () => {
    const source = readSource('src/views/system/role/index.vue')
    const businessTable = readSource('src/design-system/BusinessTable.vue')

    expect(source).toContain("height: 'min(720px, calc(100vh - 144px))'")
    expect(source).toContain("overflowY: 'hidden'")
    expect(source).toContain('const permissionColumnWidths: Record<ActionGroup, number>')
    expect(source).toContain('minWidth: 212')
    expect(source).toContain('width: permissionColumnWidths[key]')
    expect(source).toContain('fit-container')
    expect(source).toContain('.perm-tree-container :deep(.business-table__viewport)')
    expect(source).toContain('max-height: none')
    expect(source).not.toContain('max-height: 580px')
    expect(source).not.toContain('overflow-y: auto')
    expect(businessTable).toContain('viewportWidth.value = viewport.clientWidth')
    expect(businessTable).not.toContain('entry?.contentRect.width')
  })
})
