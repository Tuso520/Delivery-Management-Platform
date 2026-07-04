export interface Language {
  id: string
  languageCode: string
  languageName: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface CreateLanguageDto {
  languageCode: string
  languageName: string
}

export interface UpdateLanguageDto {
  languageName?: string
}

export interface Translation {
  id: string
  contentType: string
  contentId: string
  fieldName: string
  languageCode: string
  fieldValue: string
  version: string
  reviewStatus: string
  createdAt: string
  updatedAt: string
}

export interface CreateTranslationDto {
  contentType: string
  contentId: string
  fieldName: string
  languageCode: string
  fieldValue: string
}

export interface UpdateTranslationDto {
  fieldValue?: string
}

export interface QueryTranslationParams {
  contentType: string
  contentId?: string
  languageCode?: string
}
