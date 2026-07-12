import type { LocaleCode } from '@/store/locale'

const labels = {
  status: {
    DRAFT: ['草稿', 'Draft'],
    ACTIVE: ['进行中', 'Active'],
    PAUSED: ['暂停', 'Paused'],
    COMPLETED: ['已完成', 'Completed'],
    CANCELLED: ['已取消', 'Cancelled'],
  },
  risk: {
    Low: ['低', 'Low'],
    Medium: ['中', 'Medium'],
    High: ['高', 'High'],
    Critical: ['严重', 'Critical'],
  },
  stage: {
    STARTUP: ['启动', 'Startup'],
    DEEPENING: ['深化', 'Deepening'],
    PROCUREMENT: ['采购', 'Procurement'],
    CONSTRUCTION: ['施工', 'Construction'],
    COMMISSIONING: ['调试', 'Commissioning'],
    TESTING: ['测试', 'Testing'],
    INTERNAL_ACCEPTANCE: ['内验', 'Internal Acceptance'],
    EXTERNAL_ACCEPTANCE: ['外验', 'External Acceptance'],
    WARRANTY: ['维保', 'Warranty'],
  },
} as const

type LabelGroup = keyof typeof labels

function localize(group: LabelGroup, value: string, locale: LocaleCode): string {
  const options = labels[group] as Record<string, readonly [string, string]>
  const translation = options[value]
  if (!translation) return value
  return translation[locale === 'en-US' ? 1 : 0]
}

export const localizeProjectStatus = (value: string, locale: LocaleCode) =>
  localize('status', value, locale)

export const localizeProjectRisk = (value: string, locale: LocaleCode) =>
  localize('risk', value, locale)

export const localizeProjectStage = (value: string, locale: LocaleCode) =>
  localize('stage', value, locale)
