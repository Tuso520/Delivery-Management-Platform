import type { FieldRule, ValidateTrigger } from '@arco-design/web-vue'

export type FormRule = FieldRule & {
  trigger?: ValidateTrigger | ValidateTrigger[]
}

export type FormRules = Record<string, FormRule | FormRule[]>
