import type { LocaleCode } from '@/store/locale'

const labels = {
  status: {
    Draft: ['草稿', 'Draft'],
    Active: ['进行中', 'Active'],
    Suspended: ['暂停', 'Suspended'],
    Delayed: ['延期', 'Delayed'],
    Accepted: ['已验收', 'Accepted'],
    Archived: ['已归档', 'Archived'],
    Closed: ['已关闭', 'Closed'],
  },
  risk: {
    Low: ['低', 'Low'],
    Medium: ['中', 'Medium'],
    High: ['高', 'High'],
    Critical: ['严重', 'Critical'],
  },
  stage: {
    Initiation: ['项目启动', 'Initiation'],
    Design: ['深化设计', 'Detailed Design'],
    Procurement: ['采购与生产', 'Procurement & Production'],
    Construction: ['施工与安装', 'Construction & Installation'],
    Commissioning: ['调试阶段', 'Commissioning'],
    Acceptance: ['验收阶段', 'Acceptance'],
    Closing: ['收尾阶段', 'Closing'],
    Review: ['项目复盘', 'Project Review'],
    '01_sale': ['售前与项目启动', 'Pre-sales & Initiation'],
    '01_presale': ['售前与项目启动', 'Pre-sales & Initiation'],
    '02_design': ['深化设计', 'Detailed Design'],
    '03_procurement': ['采购与生产', 'Procurement & Production'],
    '04_construction': ['施工与安装', 'Construction & Installation'],
    '05_acceptance': ['调试与验收', 'Commissioning & Acceptance'],
    '06_review': ['收尾与复盘', 'Closing & Review'],
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
