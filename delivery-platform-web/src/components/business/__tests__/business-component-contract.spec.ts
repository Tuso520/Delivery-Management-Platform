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
    expect(source('src/views/project/index.vue')).toContain('<StatCard')
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
