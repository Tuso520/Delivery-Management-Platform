import request from './request'
import type { PaginatedData } from '@/types/api'
import type { Country, QueryCountryParams } from '@/types/country'

export const countryApi = {
  getList(params: QueryCountryParams) {
    return request.get<PaginatedData<Country>>('/countries', { params })
  },
}
