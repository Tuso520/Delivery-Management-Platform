import { describe, expect, it } from 'vitest'

import {
  localizeProjectRisk,
  localizeProjectStage,
  localizeProjectStatus,
} from '../project-localization'

describe('project localization', () => {
  it('uses Chinese labels for the Chinese locale', () => {
    expect(localizeProjectRisk('Critical', 'zh-CN')).toBe('严重')
    expect(localizeProjectStage('CONSTRUCTION', 'zh-CN')).toBe('施工')
    expect(localizeProjectStatus('ACTIVE', 'zh-CN')).toBe('进行中')
    expect(localizeProjectStage('INTERNAL_ACCEPTANCE', 'zh-CN')).toBe('内验')
    expect(localizeProjectStatus('CANCELLED', 'zh-CN')).toBe('已取消')
  })

  it('uses English labels for the English locale', () => {
    expect(localizeProjectRisk('Critical', 'en-US')).toBe('Critical')
    expect(localizeProjectStage('CONSTRUCTION', 'en-US')).toBe('Construction')
    expect(localizeProjectStatus('ACTIVE', 'en-US')).toBe('Active')
    expect(localizeProjectStage('WARRANTY', 'en-US')).toBe('Warranty')
    expect(localizeProjectStatus('COMPLETED', 'en-US')).toBe('Completed')
  })

  it('keeps unknown configured values visible', () => {
    expect(localizeProjectStage('custom-stage', 'zh-CN')).toBe('custom-stage')
  })
})
