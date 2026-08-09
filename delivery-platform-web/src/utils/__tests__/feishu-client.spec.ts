import { describe, expect, it, vi } from 'vitest'

import {
  FEISHU_AUTO_LOGIN_SESSION_KEY,
  claimFeishuAutoLogin,
  isFeishuClient,
  suppressFeishuAutoLogin,
} from '@/utils/feishu-client'

describe('Feishu client auto login', () => {
  it.each([
    'Mozilla/5.0 Lark/7.31.5 Electron/28.2.10',
    'Mozilla/5.0 Feishu/7.31.5 Mobile',
  ])('recognizes a Feishu web container from %s', (userAgent) => {
    expect(isFeishuClient(userAgent)).toBe(true)
  })

  it('does not auto-start in a regular browser', () => {
    expect(isFeishuClient('Mozilla/5.0 Chrome/127.0.0.0 Safari/537.36')).toBe(false)
  })

  it('claims at most one automatic attempt in the current tab', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    }

    expect(claimFeishuAutoLogin(storage, 'Lark/7.31.5')).toBe(true)
    expect(storage.setItem).toHaveBeenCalledWith(FEISHU_AUTO_LOGIN_SESSION_KEY, '1')
    expect(claimFeishuAutoLogin(storage, 'Lark/7.31.5')).toBe(false)
  })

  it('fails closed when the one-attempt marker cannot be persisted', () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('storage unavailable')
      }),
    }

    expect(claimFeishuAutoLogin(storage, 'Feishu/7.31.5')).toBe(false)
  })

  it('suppresses automatic login after an explicit logout', () => {
    const storage = { setItem: vi.fn() }

    suppressFeishuAutoLogin(storage)

    expect(storage.setItem).toHaveBeenCalledWith(FEISHU_AUTO_LOGIN_SESSION_KEY, '1')
  })
})
