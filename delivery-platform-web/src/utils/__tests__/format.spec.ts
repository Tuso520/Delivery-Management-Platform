import { describe, expect, it } from 'vitest'

import { formatAdaptiveNumber } from '@/utils/format'

describe('formatAdaptiveNumber', () => {
  it('keeps integers compact and rounds decimal values to exactly two places', () => {
    expect(formatAdaptiveNumber(1234567)).toBe('1,234,567')
    expect(formatAdaptiveNumber(1234567.1)).toBe('1,234,567.10')
    expect(formatAdaptiveNumber(1234567.126)).toBe('1,234,567.13')
  })

  it('honors an explicit two-decimal money format for integer values', () => {
    expect(formatAdaptiveNumber(1234567, { fractionDigits: 2 })).toBe('1,234,567.00')
    expect(formatAdaptiveNumber('987654321012', { fractionDigits: 2 })).toBe(
      '987,654,321,012.00',
    )
  })

  it('accepts numeric strings without producing NaN', () => {
    expect(formatAdaptiveNumber('987654321012')).toBe('987,654,321,012')
    expect(formatAdaptiveNumber('1000.567')).toBe('1,000.57')
  })

  it('uses the configured placeholder for missing and invalid values', () => {
    const options = { placeholder: '—' }
    expect(formatAdaptiveNumber(null, options)).toBe('—')
    expect(formatAdaptiveNumber(undefined, options)).toBe('—')
    expect(formatAdaptiveNumber('', options)).toBe('—')
    expect(formatAdaptiveNumber('not-a-number', options)).toBe('—')
    expect(formatAdaptiveNumber(Number.NaN, options)).toBe('—')
  })
})
