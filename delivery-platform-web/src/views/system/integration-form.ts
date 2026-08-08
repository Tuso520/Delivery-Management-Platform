import type { IntegrationConfig, IntegrationProvider, UpdateIntegrationDto } from '@/types/settings'

export const MASKED_SECRET = '******'

export interface IntegrationEditorForm {
  configName: string
  description: string
  isEnabled: boolean
  appId: string
  appSecret: string
  contactDepartmentId: string
  oauthRedirectUri: string
  testRecipient: string
  testRecipientEmail: string
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
    contactDepartmentId: '',
    oauthRedirectUri: '',
    testRecipient: '',
    testRecipientEmail: '',
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
    contactDepartmentId: visibleValue(config.configuration.contactDepartmentId),
    oauthRedirectUri: visibleValue(config.configuration.oauthRedirectUri),
    testRecipient: visibleValue(config.configuration.testRecipient),
    testRecipientEmail: visibleValue(config.configuration.testRecipientEmail),
    // Secret fields stay empty until the user explicitly replaces them.
    appSecret: '',
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
  _provider: IntegrationProvider,
  form: IntegrationEditorForm,
): UpdateIntegrationDto {
  const payload: UpdateIntegrationDto = {
    configName: form.configName.trim(),
    description: form.description.trim(),
    isEnabled: form.isEnabled,
  }

  assignNonEmpty(payload, 'contactDepartmentId', form.contactDepartmentId)
  assignNonEmpty(payload, 'oauthRedirectUri', form.oauthRedirectUri)
  assignNonEmpty(payload, 'testRecipient', form.testRecipient)
  assignNonEmpty(payload, 'testRecipientEmail', form.testRecipientEmail)

  assignNonEmpty(payload, 'appId', form.appId)
  assignNonEmpty(payload, 'appSecret', form.appSecret)

  return payload
}

export function hasConfiguredSecret(
  config: IntegrationConfig | undefined,
  key: 'appSecret',
): boolean {
  return Boolean(config?.configuration[key])
}
