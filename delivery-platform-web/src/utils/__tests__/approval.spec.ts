import { describe, expect, it } from 'vitest'

import { getApprovalBusinessLabel, getApprovalBusinessRoute } from '../approval'

describe('approval display helpers', () => {
  it('maps supported business types to readable labels', () => {
    expect(getApprovalBusinessLabel('report')).toBe('工作报告')
    expect(getApprovalBusinessLabel('checklist')).toBe('检查模板记录')
    expect(getApprovalBusinessLabel('process_record')).toBe('项目过程记录')
  })

  it('maps approval tasks to their business pages', () => {
    expect(getApprovalBusinessRoute('report', 'report-1')).toBe('/report/detail/report-1')
    expect(getApprovalBusinessRoute('knowledge', 'article-1')).toBe('/knowledge/article-1')
    expect(getApprovalBusinessRoute('checklist', 'item-1')).toBe('/field-check')
    expect(getApprovalBusinessRoute('performance', 'score-1')).toBe('/okr')
  })
})
