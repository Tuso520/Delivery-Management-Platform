import request from './request'
import type { Language, CreateLanguageDto, UpdateLanguageDto, Translation, CreateTranslationDto, UpdateTranslationDto, QueryTranslationParams } from '@/types/language'

export const languageApi = {
  getList() {
    return request.get<Language[]>('/languages')
  },

  getById(id: string) {
    return request.get<Language>(`/languages/${id}`)
  },

  create(data: CreateLanguageDto) {
    return request.post<Language>('/languages', data)
  },

  update(id: string, data: UpdateLanguageDto) {
    return request.put<Language>(`/languages/${id}`, data)
  },

  delete(id: string) {
    return request.delete<void>(`/languages/${id}`)
  },

  // Translations
  getTranslations(params: QueryTranslationParams) {
    return request.get<Translation[]>('/translations', { params })
  },

  upsertTranslation(data: CreateTranslationDto) {
    return request.post<Translation>('/translations', data)
  },

  updateTranslation(id: string, data: UpdateTranslationDto) {
    return request.put<Translation>(`/translations/${id}`, data)
  },

  deleteTranslation(id: string) {
    return request.delete<void>(`/translations/${id}`)
  },
}
