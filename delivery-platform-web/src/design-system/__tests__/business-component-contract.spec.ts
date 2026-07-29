import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('business component adoption contract', () => {
  it('uses the shared workbench shell across the owned project and settings pages', () => {
    const pageContainers = [
      'src/domains/project/pages/ProjectOverviewPage.vue',
      'src/domains/archive/pages/ArchiveWorkspacePage.vue',
      'src/views/system/notification.vue',
      'src/views/system/config.vue',
      'src/views/system/integrations.vue',
      'src/views/system/approvals.vue',
    ]
    for (const path of pageContainers) expect(source(path)).toContain('<PageContainer')

    const tablePages = [
      'src/domains/project/pages/ProjectOverviewPage.vue',
      'src/domains/archive/pages/ArchiveWorkspacePage.vue',
      'src/views/system/notification.vue',
      'src/views/system/integrations.vue',
      'src/views/system/approvals.vue',
    ]
    for (const path of tablePages) expect(source(path)).toContain('<BusinessTable')

    expect(source('src/views/system/config.vue')).toContain('<StickyActionBar')
    expect(source('src/domains/project/components/ProjectDetailDialog.vue')).toContain(
      'class="project-detail-dialog"',
    )
    expect(source('src/domains/project/pages/ProjectOverviewPage.vue')).toContain(
      'class="summary-band"',
    )
    expect(source('src/domains/archive/pages/ArchiveWorkspacePage.vue')).toContain(
      'class="archive-metrics"',
    )
  })

  it('forwards named table slots and keeps modal and drawer behaviors explicit', () => {
    const table = source('src/design-system/BusinessTable.vue')
    const modal = source('src/design-system/BusinessModal.vue')
    const drawer = source('src/design-system/BusinessDrawer.vue')

    expect(table).toContain('forwardedSlotNames')
    expect(table).toContain('#[slotName]="slotProps"')
    expect(modal).toContain(':on-before-ok="onBeforeOk"')
    expect(drawer).toContain('props.width ?? widths[props.size]')
  })

  it('uses container infinite loading instead of pagination controls', () => {
    const table = source('src/design-system/BusinessTable.vue')

    expect(table).toContain('batchSize: 20')
    expect(table).toContain('remaining <= 120')
    expect(table).toContain("emit('pageChange', nextPage)")
    expect(table).toContain('accumulatedData.value.length >= props.pagination.total')
    expect(table).toContain('@scroll.passive="handleViewportScroll"')
    expect(table).not.toContain('<a-pagination')
  })

  it('uses one adaptive scroll viewport and keeps every table cell on one line', () => {
    const table = source('src/design-system/BusinessTable.vue')
    expect(table).toContain('shouldDistributeColumns')
    expect(table).toContain('withoutExplicitWidth')
    expect(table).toContain('!props.preserveColumnWidths')
    expect(table).toContain('business-table--preserve-column-widths')
    expect(table).toContain('width: max-content')
    expect(table).toContain('min-width: 100%')
    expect(table).toContain('white-space: nowrap')
    expect(table).toContain("size: 'large'")
  })

  it('keeps archive template fixed columns stable while long-text columns fill the viewport', () => {
    const archiveTemplate = source('src/domains/archive/pages/ArchiveTemplatePage.vue')
    expect(archiveTemplate).toContain('fit-container')
    expect(archiveTemplate).toContain(':scroll="{ minWidth: 1208 }"')
    expect(archiveTemplate).toContain(':bordered="{ wrapper: false, cell: true }"')
    expect(archiveTemplate).toContain(':min-width="280"')
    expect(archiveTemplate).toContain(':width="182"')
    expect(archiveTemplate).toContain('fixed="right"')
    expect(archiveTemplate).toContain('grid-template-columns: minmax(0, 1fr)')
  })

  it('keeps the project archive workspace aligned to the Figma 43:317 grid', () => {
    const archive = source('src/domains/archive/pages/ArchiveWorkspacePage.vue')

    expect(archive).toContain('grid-template-columns: 270px minmax(937px, 1fr)')
    expect(archive).toContain(':scroll="{ x: 937 }"')
    expect(archive).toContain('height: 100%')
    expect(archive).toContain('flex: 1 1 auto')
    expect(archive).toContain('border-right: 1px solid var(--archive-border) !important')
    expect(archive).toContain(':title="t(\'archive.columns.fileName\')" :width="340"')
    expect(archive).toContain(':title="t(\'archive.columns.version\')" :width="80"')
    expect(archive).toContain(':title="t(\'archive.columns.fileSize\')" :width="100"')
    expect(archive).toContain(':title="t(\'archive.columns.uploader\')" :width="113"')
    expect(archive).toContain(':title="t(\'archive.columns.uploadedAt\')" :width="122"')
    expect(archive).toContain(':title="t(\'common.action\')" :width="182"')
    expect(archive).not.toContain('archive.syncTemplate')
    expect(archive).not.toContain('record.canRestore')
  })

  it('removes the global page and Arco compatibility layer', () => {
    const global = source('src/styles/global.scss')
    expect(global).not.toContain('compatibility layer')
    expect(global).not.toContain('.resource-page')
    expect(global).not.toContain('.page-toolbar')
    expect(global).not.toContain('.arco-card')
    expect(global).not.toContain('.arco-table')
  })

  it('persists the notification keyword in the URL query', () => {
    const notification = source('src/views/system/notification.vue')
    expect(notification).toContain('route.query.keyword')
    expect(notification).toContain('router.replace({')
    expect(notification).toContain('keyword: appliedKeyword.value || undefined')
  })
})
