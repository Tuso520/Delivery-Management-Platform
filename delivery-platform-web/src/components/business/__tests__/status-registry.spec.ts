import { describe, expect, it } from 'vitest'

import { statusDefinition, statusRegistry } from '@/components/business/status-registry'

describe('business status registry', () => {
  it('shares semantic colors across administration status domains', () => {
    for (const domain of ['currency', 'role', 'department'] as const) {
      expect(statusDefinition(domain, 'Active').color).toBe('green')
      expect(statusDefinition(domain, 'Inactive').color).toBe('gray')
    }
  })

  it('keeps user lock state distinct and falls back safely for unknown values', () => {
    expect(statusRegistry.user.Locked.color).toBe('red')
    expect(statusDefinition('user', 'Unexpected').color).toBe('gray')
  })

  it('covers content, archive and operations status domains centrally', () => {
    expect(statusDefinition('standard', 'PUBLISHED').color).toBe('green')
    expect(statusDefinition('knowledge', 'IN_REVIEW').color).toBe('orange')
    expect(statusDefinition('archive', 'UPLOADED').color).toBe('blue')
    expect(statusDefinition('integration', 'DEAD').color).toBe('red')
    expect(statusDefinition('log', 'denied').color).toBe('orange')
    expect(statusDefinition('notification', 'ENABLED').color).toBe('green')
    expect(statusDefinition('approval', 'DISABLED').color).toBe('gray')
    expect(statusDefinition('payment', 'Received').color).toBe('green')
  })
})
