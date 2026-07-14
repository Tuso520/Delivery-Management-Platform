import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('project overview and drawer contract', () => {
  it('renders scoped search, semantic summary cards and a normal list without actions', () => {
    const overview = source('src/views/project/index.vue')
    expect(overview).toContain("t('projects.scope.mine')")
    expect(overview).toContain("t('projects.scope.all')")
    expect(overview).toContain("tone: 'blue'")
    expect(overview).toContain("tone: 'green'")
    expect(overview).toContain("tone: 'cyan'")
    expect(overview).toContain("tone: 'red'")
    expect(overview).toContain('displayName(project)')
    expect(overview).toContain('v-if="archivedView"')
    expect(overview).toContain(':title="t(\'common.action\')"')
    expect(overview).not.toContain('project:stage:update')
  })

  it('uses one ProjectDrawer for create and edit with the required business form components', () => {
    const overview = source('src/views/project/index.vue')
    const drawer = source('src/views/project/ProjectDrawer.vue')
    expect(overview).toContain("import ProjectDrawer from './ProjectDrawer.vue'")
    expect(overview).toContain(':mode="drawerMode"')
    expect(overview).toContain('size="xl"')
    expect(drawer).toContain('<FormSection')
    expect(drawer).toContain('<FormGrid')
    expect(drawer).toContain('<ReadonlyField')
    expect(drawer).toContain('<StickyActionBar')
    expect(drawer).toContain("t('projects.createForm.saveDraft')")
    expect(drawer).not.toContain('purchaseOwnerId')
    expect(drawer).not.toContain('financeOwnerId')
  })

  it('uses the unified progress command and backend-calculated action permissions', () => {
    const detail = source('src/views/project/detail.vue')
    const api = source('src/api/project.ts')
    expect(detail).toContain('projectApi.updateProgress(')
    expect(detail).toContain('project?.canUpdateProgress')
    expect(detail).toContain('project.canArchive')
    expect(api).toContain('/projects/${id}/progress')
    expect(api).not.toContain('/projects/${id}/stage')
    expect(api).not.toContain('/projects/${id}/acceptance')
  })

  it('keeps permanent deletion in the archive list with two confirmations', () => {
    const overview = source('src/views/project/index.vue')
    const api = source('src/api/project.ts')
    expect(overview).toContain('row.canPermanentDelete')
    expect(overview.match(/await arcoConfirm/gu)?.length).toBeGreaterThanOrEqual(3)
    expect(api).toContain('/projects/${id}/permanent')
  })
})
