/**
 * Format a date string to a localized format
 */
export function formatDate(date: string | Date | null | undefined, format: string = 'YYYY-MM-DD'): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

/**
 * Format a datetime string
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  return formatDate(date, 'YYYY-MM-DD HH:mm:ss')
}

/**
 * Format currency amount with 2 decimal places
 */
export function formatCurrency(amount: number | string | null | undefined, currency: string = 'CNY'): string {
  if (amount === null || amount === undefined) return '-'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '-'

  try {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  } catch {
    return `${num.toFixed(2)} ${currency}`
  }
}

export interface FormatAdaptiveNumberOptions {
  fractionDigits?: number
  placeholder?: string
}

/**
 * Format a finite number while keeping integers compact and decimal values fixed
 * to the requested precision. Numeric strings are accepted for API compatibility.
 */
export function formatAdaptiveNumber(
  value: number | string | null | undefined,
  options: FormatAdaptiveNumberOptions = {},
): string {
  const placeholder = options.placeholder ?? '-'
  if (value === null || value === undefined || value === '') return placeholder

  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue)) return placeholder

  const fractionDigits = Number.isInteger(numericValue) ? 0 : (options.fractionDigits ?? 2)
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numericValue)
}

/**
 * Format file size from bytes to human readable
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes < 0) return '-'
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = (bytes / Math.pow(k, i)).toFixed(2)

  return `${parseFloat(size)} ${units[i]}`
}

/**
 * Format percentage
 */
export function formatPercent(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) return '-'
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Truncate a string with ellipsis
 */
export function truncate(str: string | null | undefined, maxLength: number = 100): string {
  if (!str) return '-'
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + '...'
}
