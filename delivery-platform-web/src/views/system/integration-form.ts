import type { IntegrationConfig, IntegrationProvider, UpdateIntegrationDto } from '@/types/settings'

export const MASKED_SECRET = '******'

export interface IntegrationEditorForm {
  configName: string
  description: string
  isEnabled: boolean
  appId: string
  appSecret: string
  webhookUrl: string
  verificationToken: string
  encryptKey: string
  corpId: string
  agentId: string
  secret: string
  contactDepartmentId: string
  testRecipient: string
}

export function emptyIntegrationForm(
  provider: IntegrationProvider,
  defaultName: string = provider,
): IntegrationEditorForm {
  return {
    configName: defaultName,
    description: '',
    isEnabled: false,
    appId: '',
    appSecret: '',
    webhookUrl: '',
    verificationToken: '',
    encryptKey: '',
    corpId: '',
    agentId: '',
    secret: '',
    contactDepartmentId: '',
    testRecipient: '',
  }
}

function visibleValue(value: string | null | undefined): string {
  return value && value !== MASKED_SECRET ? value : ''
}

export function hydrateIntegrationForm(
  provider: IntegrationProvider,
  config?: IntegrationConfig,
  defaultName: string = provider,
): IntegrationEditorForm {
  const form = emptyIntegrationForm(provider, defaultName)
  if (!config) return form

  return {
    ...form,
    configName: config.configName,
    description: config.description ?? '',
    isEnabled: config.isEnabled,
    appId: visibleValue(config.configuration.appId),
    webhookUrl: '',
    corpId: visibleValue(config.configuration.corpId),
    agentId: visibleValue(config.configuration.agentId),
    contactDepartmentId: visibleValue(config.configuration.contactDepartmentId),
    testRecipient: visibleValue(config.configuration.testRecipient),
    // Secret fields stay empty until the user explicitly replaces them.
    appSecret: '',
    verificationToken: '',
    encryptKey: '',
    secret: '',
  }
}

function assignNonEmpty(
  payload: UpdateIntegrationDto,
  key: keyof UpdateIntegrationDto,
  value: string,
): void {
  const normalized = value.trim()
  if (normalized && normalized !== MASKED_SECRET) {
    Object.assign(payload, { [key]: normalized })
  }
}

export function buildIntegrationUpdate(
  provider: IntegrationProvider,
  form: IntegrationEditorForm,
): UpdateIntegrationDto {
  const payload: UpdateIntegrationDto = {
    configName: form.configName.trim(),
    description: form.description.trim(),
    isEnabled: form.isEnabled,
  }

  assignNonEmpty(payload, 'webhookUrl', form.webhookUrl)
  assignNonEmpty(payload, 'contactDepartmentId', form.contactDepartmentId)
  assignNonEmpty(payload, 'testRecipient', form.testRecipient)

  if (provider === 'FEISHU') {
    assignNonEmpty(payload, 'appId', form.appId)
    assignNonEmpty(payload, 'appSecret', form.appSecret)
    assignNonEmpty(payload, 'verificationToken', form.verificationToken)
    assignNonEmpty(payload, 'encryptKey', form.encryptKey)
  } else {
    assignNonEmpty(payload, 'corpId', form.corpId)
    assignNonEmpty(payload, 'agentId', form.agentId)
    assignNonEmpty(payload, 'secret', form.secret)
  }

  return payload
}

export function hasConfiguredSecret(
  config: IntegrationConfig | undefined,
  key: 'appSecret' | 'webhookUrl' | 'verificationToken' | 'encryptKey' | 'secret',
): boolean {
  return Boolean(config?.configuration[key])
}
