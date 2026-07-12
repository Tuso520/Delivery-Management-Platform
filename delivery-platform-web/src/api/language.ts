import request from './request'
import type { Language } from '@/types/language'

export const languageApi = {
  getList() {
    return request.get<Language[]>('/languages')
  },
}
