export interface TranslationFieldOption {
  value: string
  label: string
}

const fieldOptions: Record<string, TranslationFieldOption[]> = {
  country: [
    { value: 'nameZh', label: '国家中文名' },
    { value: 'nameEn', label: '国家英文名' },
    { value: 'entryRequirements', label: '入境要求' },
    { value: 'safetyNotes', label: '安全注意事项' },
    { value: 'taxNotes', label: '税务说明' },
    { value: 'paymentNotes', label: '付款说明' },
    { value: 'supplierNotes', label: '供应商说明' },
  ],
  currency: [{ value: 'currencyName', label: '币种名称' }],
  language: [{ value: 'languageName', label: '语言名称' }],
  ui: [{ value: 'label', label: '界面文本' }],
}

export function getTranslationFieldOptions(
  contentType: string,
): TranslationFieldOption[] {
  return fieldOptions[contentType] ?? []
}
