const MONEY_PATTERN = /^\d{1,16}(?:\.\d{0,2})?$/

export function normalizeMoneyInput(value: string): string {
  const normalized = value.split(',').join('').replace(/[^\d.]/g, '')
  const [integer = '', ...fractionParts] = normalized.split('.')
  const fraction = fractionParts.join('').slice(0, 2)
  const compactInteger = integer.replace(/^0+(?=\d)/, '')
  return fractionParts.length > 0 ? `${compactInteger || '0'}.${fraction}` : compactInteger
}

export function isMoney(value: string): boolean {
  return MONEY_PATTERN.test(value) && value.length > 0
}

export function moneyToMinor(value: string | null | undefined): bigint {
  if (!value || !isMoney(value)) return 0n
  const [integer, fraction = ''] = value.split('.')
  return BigInt(integer) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function minorToMoney(value: bigint): string {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const integer = absolute / 100n
  const fraction = String(absolute % 100n).padStart(2, '0')
  return `${negative ? '-' : ''}${integer}.${fraction}`
}

export function formatMoneyString(value: string | null | undefined): string {
  if (!value || !isMoney(value)) return '—'
  const [integer, fraction = ''] = value.split('.')
  return `${BigInt(integer).toLocaleString('zh-CN')}${fraction ? `.${fraction.padEnd(2, '0')}` : ''}`
}

export function ratioPercent(amount: string, total: string): string {
  const totalMinor = moneyToMinor(total)
  if (totalMinor === 0n) return '—'
  const hundredthPercent = (moneyToMinor(amount) * 10_000n + totalMinor / 2n) / totalMinor
  const whole = hundredthPercent / 100n
  const fraction = String(hundredthPercent % 100n).padStart(2, '0')
  return `${whole}.${fraction}%`
}

export function multiplyMoneyByRate(
  amount: string,
  rate: string | number | null | undefined,
): string | undefined {
  if (!isMoney(amount) || rate == null) return undefined
  const rateText = String(rate)
  if (!/^\d+(?:\.\d{1,8})?$/.test(rateText)) return undefined
  const [integer, fraction = ''] = rateText.split('.')
  const scale = 10n ** BigInt(fraction.length)
  const scaledRate = BigInt(integer) * scale + BigInt(fraction || '0')
  const convertedMinor = (moneyToMinor(amount) * scaledRate + scale / 2n) / scale
  return minorToMoney(convertedMinor)
}

export function proportionalMoney(
  amount: string,
  total: string,
  convertedTotal: string,
): string | undefined {
  const totalMinor = moneyToMinor(total)
  if (totalMinor === 0n) return undefined
  const result =
    (moneyToMinor(amount) * moneyToMinor(convertedTotal) + totalMinor / 2n) / totalMinor
  return minorToMoney(result)
}
