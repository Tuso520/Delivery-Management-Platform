import request from './request'
import type { Currency, CreateCurrencyDto, UpdateCurrencyDto, ExchangeRate, CreateExchangeRateDto } from '@/types/currency'

export const currencyApi = {
  getList() {
    return request.get<Currency[]>('/currencies')
  },

  getById(id: string) {
    return request.get<Currency>(`/currencies/${id}`)
  },

  create(data: CreateCurrencyDto) {
    return request.post<Currency>('/currencies', data)
  },

  update(id: string, data: UpdateCurrencyDto) {
    return request.put<Currency>(`/currencies/${id}`, data)
  },

  delete(id: string) {
    return request.delete<void>(`/currencies/${id}`)
  },

  // Exchange rates
  getExchangeRates(from?: string, to?: string) {
    return request.get<ExchangeRate[]>('/exchange-rates', {
      params: { from, to },
    })
  },

  addExchangeRate(data: CreateExchangeRateDto) {
    return request.post<ExchangeRate>('/exchange-rates', data)
  },

  syncExchangeRates(baseCurrency = 'CNY') {
    return request.post<{
      baseCurrency: string
      rateDate: string
      source: string
      sourceUrl: string
      syncedCount: number
    }>('/exchange-rates/sync', { baseCurrency })
  },

  lockExchangeRate(id: string) {
    return request.put<ExchangeRate>(`/exchange-rates/${id}/lock`)
  },

  unlockExchangeRate(id: string) {
    return request.put<ExchangeRate>(`/exchange-rates/${id}/unlock`)
  },
}
