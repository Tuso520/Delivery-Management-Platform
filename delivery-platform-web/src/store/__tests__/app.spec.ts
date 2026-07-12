import { describe, expect, it } from 'vitest'

import { resolveThemeMode } from '@/store/app'

describe('application theme mode', () => {
  it('keeps explicit light and dark choices', () => {
    expect(resolveThemeMode('light', true)).toBe('light')
    expect(resolveThemeMode('dark', false)).toBe('dark')
  })

  it('resolves system mode from the operating-system preference', () => {
    expect(resolveThemeMode('system', true)).toBe('dark')
    expect(resolveThemeMode('system', false)).toBe('light')
  })
})
