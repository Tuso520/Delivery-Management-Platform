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
      contactDepartmentId: '0',
      oauthRedirectUri: 'https://example.com/api/v1/auth/feishu/callback',
      testRecipient: 'ou_123',
      testRecipientEmail: 'recipient@example.com',
      testRecipientUserId: '11111111-1111-4111-8111-111111111111',
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
    expect(form.testRecipientEmail).toBe('recipient@example.com')
    expect(form.testRecipientUserId).toBe('11111111-1111-4111-8111-111111111111')
    expect(form.oauthRedirectUri).toBe('https://example.com/api/v1/auth/feishu/callback')
  })

  it('omits masked and blank secrets from an update payload', () => {
    const form = hydrateIntegrationForm('FEISHU', feishuConfig())
    form.appSecret = MASKED_SECRET

    const payload = buildIntegrationUpdate('FEISHU', form)

    expect(payload.appId).toBe('cli_app_123')
    expect(payload).not.toHaveProperty('appSecret')
  })

  it('sends a secret only after the user re-enters a new plaintext value', () => {
    const form = hydrateIntegrationForm('FEISHU', feishuConfig())
    form.appSecret = 'new-app-secret'

    const payload = buildIntegrationUpdate('FEISHU', form)

    expect(payload.appSecret).toBe('new-app-secret')
  })

  it('prefers an explicitly selected synchronized user over legacy recipient fallbacks', () => {
    const payload = buildIntegrationUpdate('FEISHU', hydrateIntegrationForm('FEISHU', feishuConfig()))

    expect(payload.testRecipientUserId).toBe('11111111-1111-4111-8111-111111111111')
    expect(payload).not.toHaveProperty('testRecipient')
    expect(payload).not.toHaveProperty('testRecipientEmail')
  })
})
