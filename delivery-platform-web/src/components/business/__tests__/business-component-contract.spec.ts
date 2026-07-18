import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('business component adoption contract', () => {
  it('uses the shared workbench shell across the owned project and settings pages', () => {
    const pageContainers = [
      'src/views/project/index.vue',
      'src/views/archive/index.vue',
      'src/views/system/notification.vue',
      'src/views/system/config.vue',
      'src/views/system/logs.vue',
      'src/views/system/integrations.vue',
      'src/views/system/approvals.vue',
    ]
    for (const path of pageContainers) expect(source(path)).toContain('<PageContainer')

    const tablePages = [
      'src/views/project/index.vue',
      'src/views/archive/index.vue',
      'src/views/system/notification.vue',
      'src/views/system/logs.vue',
      'src/views/system/integrations.vue',
      'src/views/system/approvals.vue',
    ]
    for (const path of tablePages) expect(source(path)).toContain('<BusinessTable')

    expect(source('src/views/system/config.vue')).toContain('<StickyActionBar')
    expect(source('src/views/project/ProjectDrawer.vue')).toContain('<StickyActionBar')
    expect(source('src/views/project/index.vue')).toContain('class="summary-band"')
    expect(source('src/views/archive/index.vue')).toContain('<StatCard')
  })

  it('forwards named table slots and keeps modal and drawer behaviors explicit', () => {
    const table = source('src/components/business/BusinessTable.vue')
    const modal = source('src/components/business/BusinessModal.vue')
    const drawer = source('src/components/business/BusinessDrawer.vue')

    expect(table).toContain('forwardedSlotNames')
    expect(table).toContain('#[slotName]="slotProps"')
    expect(modal).toContain(':on-before-ok="onBeforeOk"')
    expect(drawer).toContain('props.width ?? widths[props.size]')
  })

  it('uses container infinite loading instead of pagination controls', () => {
    const table = source('src/components/business/BusinessTable.vue')

    expect(table).toContain('batchSize: 20')
    expect(table).toContain('remaining <= 120')
    expect(table).toContain("emit('pageChange', nextPage)")
    expect(table).toContain('accumulatedData.value.length >= props.pagination.total')
    expect(table).toContain('@scroll.passive="handleViewportScroll"')
    expect(table).not.toContain('<a-pagination')
  })

  it('uses one adaptive scroll viewport and keeps every table cell on one line', () => {
    const table = source('src/components/business/BusinessTable.vue')
    expect(table).toContain('shouldDistributeColumns')
    expect(table).toContain('withoutExplicitWidth')
    expect(table).toContain('!props.preserveColumnWidths')
    expect(table).toContain('business-table--preserve-column-widths')
    expect(table).toContain('width: max-content')
    expect(table).toContain('min-width: 100%')
    expect(table).toContain('white-space: nowrap')
    expect(table).toContain("size: 'large'")
  })

  it('keeps archive template columns stable at their declared total width', () => {
    const archiveTemplate = source('src/views/archive/template.vue')
    expect(archiveTemplate).toContain('preserve-column-widths')
    expect(archiveTemplate).toContain(':scroll="{ x: 1250 }"')
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
