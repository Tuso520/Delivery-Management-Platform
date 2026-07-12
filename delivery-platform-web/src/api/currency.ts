import request from './request'
import type {
  CreateCurrencyDto,
  Currency,
  CurrencyRateSyncResult,
  UpdateCurrencyDto,
} from '@/types/currency'

export const currencyApi = {
  getList() {
    return request.get<Currency[]>('/currencies')
  },

  create(data: CreateCurrencyDto) {
    return request.post<Currency>('/currencies', data)
  },

  updateByCode(code: string, data: UpdateCurrencyDto) {
    return request.patch<Currency>(`/currencies/${code}`, data)
  },

  syncRates() {
    return request.post<CurrencyRateSyncResult>('/currencies/sync-rates')
  },

  lockRate(code: string) {
    return request.post<Currency>(`/currencies/${code}/lock`)
  },

  unlockRate(code: string) {
    return request.post<Currency>(`/currencies/${code}/unlock`)
  },

  disable(code: string) {
    return request.post<Currency>(`/currencies/${code}/disable`)
  },
}
