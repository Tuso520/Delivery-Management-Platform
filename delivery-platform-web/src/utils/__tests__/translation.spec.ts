import { describe, expect, it } from 'vitest'

import { getTranslationFieldOptions } from '../translation'

describe('translation field options', () => {
  it('provides configured fields for the selected content type', () => {
    expect(getTranslationFieldOptions('currency')).toEqual([
      { value: 'currencyName', label: '币种名称' },
    ])
  })

  it('returns no free-form fallback for an unsupported content type', () => {
    expect(getTranslationFieldOptions('unknown')).toEqual([])
  })
})
