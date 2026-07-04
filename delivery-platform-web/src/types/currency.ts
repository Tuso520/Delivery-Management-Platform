export interface Currency {
  id: string
  currencyCode: string
  currencyName: string
  currencySymbol: string | null
  decimalPlaces: number
  status: string
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
}

export interface ExchangeRate {
  id: string
  fromCurrency: string
  toCurrency: string
  rate: number
  rateDate: string
  source: string
  isLocked: boolean
  confirmedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateExchangeRateDto {
  fromCurrency: string
  toCurrency: string
  rate: number
  rateDate?: string
  source?: string
}
