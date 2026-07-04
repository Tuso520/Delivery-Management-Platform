import { describe, expect, it } from 'vitest'

import {
  localizeProjectRisk,
  localizeProjectStage,
  localizeProjectStatus,
} from '../project-localization'

describe('project localization', () => {
  it('uses Chinese labels for the Chinese locale', () => {
    expect(localizeProjectRisk('Critical', 'zh-CN')).toBe('严重')
    expect(localizeProjectStage('04_construction', 'zh-CN')).toBe('施工与安装')
    expect(localizeProjectStatus('Active', 'zh-CN')).toBe('进行中')
  })

  it('uses English labels for the English locale', () => {
    expect(localizeProjectRisk('Critical', 'en-US')).toBe('Critical')
    expect(localizeProjectStage('04_construction', 'en-US')).toBe(
      'Construction & Installation',
    )
    expect(localizeProjectStatus('Active', 'en-US')).toBe('Active')
  })

  it('keeps unknown configured values visible', () => {
    expect(localizeProjectStage('custom-stage', 'zh-CN')).toBe('custom-stage')
  })
})
