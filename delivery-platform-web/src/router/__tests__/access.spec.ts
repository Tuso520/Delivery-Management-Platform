// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { getFirstAccessiblePath } from '@/router/access'
import { firstRouteParam, preservedRouteQuery } from '@/router/query-state'

describe('authenticated route fallbacks', () => {
  it('prefers explicit main access, then settings, then public main pages', () => {
    expect(getFirstAccessiblePath(['project:view'])).toBe('/projects')
    expect(getFirstAccessiblePath(['currency:view'])).toBe('/settings/currency')
    expect(getFirstAccessiblePath([])).toBe('/review')
  })

  it('preserves list filters while removing transient drawer state', () => {
    expect(
      preservedRouteQuery(
        { page: '2', keyword: 'audit', versionId: 'version-1', empty: null },
        ['versionId'],
      ),
    ).toEqual({ page: '2', keyword: 'audit' })
    expect(firstRouteParam(['item-1', 'item-2'])).toBe('item-1')
  })
})
