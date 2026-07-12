export interface Country {
  id: string
  countryCode: string
  nameZh: string
  nameEn: string
  defaultLanguage: string | null
  defaultCurrency: string | null
  timezone: string | null
  weekendRule: string | null
  entryRequirements: string | null
  safetyNotes: string | null
  taxNotes: string | null
  paymentNotes: string | null
  supplierNotes: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface QueryCountryParams {
  page?: number
  pageSize?: number
  keyword?: string
  status?: string
}
