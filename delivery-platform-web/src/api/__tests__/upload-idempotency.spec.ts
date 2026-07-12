import { describe, expect, it, vi } from 'vitest'

import { runIdempotentUpload } from '@/api/upload-idempotency'

describe('upload idempotency key lifecycle', () => {
  it('reuses a key after failure and releases it only after success', async () => {
    const file = new File(['same content'], 'archive.pdf')
    const keys: string[] = []

    await expect(
      runIdempotentUpload(file, 'project-1:item-1', async (key) => {
        keys.push(key)
        throw new Error('network unavailable')
      }),
    ).rejects.toThrow('network unavailable')

    await runIdempotentUpload(file, 'project-1:item-1', async (key) => {
      keys.push(key)
      return 'replayed'
    })
    await runIdempotentUpload(file, 'project-1:item-1', async (key) => {
      keys.push(key)
      return 'new operation'
    })

    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[1])
  })

  it('uses different keys for different upload targets', async () => {
    const file = new File(['same content'], 'archive.pdf')
    const upload = vi.fn(async (key: string) => key)

    const first = await runIdempotentUpload(file, 'project-1:item-1', upload)
    const second = await runIdempotentUpload(file, 'project-1:item-2', upload)

    expect(first).not.toBe(second)
  })
})
