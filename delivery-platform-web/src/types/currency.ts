export interface Currency {
  id: string
  currencyCode: string
  currencyName: string
  currencySymbol: string | null
  decimalPlaces: number
  status: string
  cnyRate: number | string | null
  rateDate: string | null
  rateLocked: boolean
  lockedBy: string | null
  lockedAt: string | null
  rateSource: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateCurrencyDto {
  currencyCode: string
  currencyName: string
  currencySymbol?: string
  decimalPlaces?: number
}

export interface UpdateCurrencyDto {
  currencyName?: string
  currencySymbol?: string
  decimalPlaces?: number
  cnyRate?: number
}

export interface CurrencyRateSyncResult {
  baseCurrency: string
  rateDate: string
  source: string
  sourceUrl?: string
  syncedCount: number
}
