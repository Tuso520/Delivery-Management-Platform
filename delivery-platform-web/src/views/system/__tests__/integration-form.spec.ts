import { describe, expect, it } from 'vitest'

import type { IntegrationConfig } from '@/types/settings'
import {
  MASKED_SECRET,
  buildIntegrationUpdate,
  hydrateIntegrationForm,
} from '../integration-form'

function feishuConfig(): IntegrationConfig {
  return {
    id: 'integration-1',
    provider: 'FEISHU',
    configName: '飞书生产集成',
    isEnabled: true,
    description: '同步交付中心通讯录',
    configuration: {
      appId: 'cli_app_123',
      appSecret: MASKED_SECRET,
      webhookUrl: MASKED_SECRET,
      verificationToken: 'unexpected-plaintext-token',
      encryptKey: MASKED_SECRET,
      contactDepartmentId: '0',
      testRecipient: 'ou_123',
    },
    capabilities: ['CONTACT_SYNC', 'NOTIFICATION'],
    updatedAt: '2026-07-11T00:00:00.000Z',
  }
}

describe('integration secret form safety', () => {
  it('never hydrates any secret-like response field into editable inputs', () => {
    const form = hydrateIntegrationForm('FEISHU', feishuConfig())

    expect(form.appId).toBe('cli_app_123')
    expect(form.appSecret).toBe('')
    expect(form.webhookUrl).toBe('')
    expect(form.verificationToken).toBe('')
    expect(form.encryptKey).toBe('')
  })

  it('omits masked and blank secrets from an update payload', () => {
    const form = hydrateIntegrationForm('FEISHU', feishuConfig())
    form.appSecret = MASKED_SECRET
    form.webhookUrl = '   '

    const payload = buildIntegrationUpdate('FEISHU', form)

    expect(payload.appId).toBe('cli_app_123')
    expect(payload).not.toHaveProperty('appSecret')
    expect(payload).not.toHaveProperty('webhookUrl')
    expect(payload).not.toHaveProperty('verificationToken')
    expect(payload).not.toHaveProperty('encryptKey')
  })

  it('sends a secret only after the user re-enters a new plaintext value', () => {
    const form = hydrateIntegrationForm('FEISHU', feishuConfig())
    form.appSecret = 'new-app-secret'

    const payload = buildIntegrationUpdate('FEISHU', form)

    expect(payload.appSecret).toBe('new-app-secret')
  })
})
