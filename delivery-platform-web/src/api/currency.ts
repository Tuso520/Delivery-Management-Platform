import request from './request'
import type {
  Currency,
  CurrencyRateSyncResult,
  UpdateCurrencyDto,
} from '@/types/currency'

export const currencyApi = {
  getList() {
    return request.get<Currency[]>('/currencies')
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
}
