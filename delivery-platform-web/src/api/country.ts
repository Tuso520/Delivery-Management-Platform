import request from './request'
import type { PaginatedData } from '@/types/api'
import type { Country, CreateCountryDto, UpdateCountryDto, QueryCountryParams } from '@/types/country'

export const countryApi = {
  getList(params: QueryCountryParams) {
    return request.get<PaginatedData<Country>>('/countries', { params })
  },

  getById(id: string) {
    return request.get<Country>(`/countries/${id}`)
  },

  create(data: CreateCountryDto) {
    return request.post<Country>('/countries', data)
  },

  update(id: string, data: UpdateCountryDto) {
    return request.put<Country>(`/countries/${id}`, data)
  },

  delete(id: string) {
    return request.delete<void>(`/countries/${id}`)
  },
}
