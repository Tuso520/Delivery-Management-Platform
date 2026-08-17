import { describe, expect, it } from 'vitest'

import {
  formatMoneyString,
  moneyToMinor,
  multiplyMoneyByRate,
  moneyFromPercent,
  normalizeMoneyInput,
  normalizePercentInput,
  percentValue,
  proportionalMoney,
  ratioPercent,
  isMoney,
  isPercent,
} from '../decimal-money'

describe('decimal money utilities', () => {
  it('keeps large VND-style values as decimal strings without scientific notation', () => {
    const value = normalizeMoneyInput('9,007,199,254,740,991.99')

    expect(value).toBe('9007199254740991.99')
    expect(moneyToMinor(value)).toBe(900719925474099199n)
    expect(formatMoneyString(value)).toBe('9,007,199,254,740,991.99')
    expect(isMoney('10000000000000000.00')).toBe(false)
  })

  it('uses integer arithmetic for rates, ratios and proportional converted amounts', () => {
    expect(multiplyMoneyByRate('1234567890123456.78', '0.00028123')).toBe(
      '347197527739.42',
    )
    expect(ratioPercent('300000.00', '1000000.00')).toBe('30.00%')
    expect(proportionalMoney('300000.00', '1000000.00', '7200000.00')).toBe(
      '2160000.00',
    )
  })

  it('converts payment percentages and money in both directions with validation', () => {
    expect(normalizePercentInput('030.129%')).toBe('30.12')
    expect(isPercent('100.00')).toBe(true)
    expect(isPercent('100.01')).toBe(false)
    expect(isPercent('1000')).toBe(false)
    expect(isPercent('')).toBe(false)
    expect(moneyFromPercent('30.00', '1000000.00')).toBe('300000.00')
    expect(percentValue('300000.00', '1000000.00')).toBe('30.00')
    expect(moneyFromPercent('30.00', '0')).toBeUndefined()
    expect(percentValue('300000.00', '')).toBeUndefined()
  })
})
