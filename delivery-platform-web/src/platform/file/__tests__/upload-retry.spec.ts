import { describe, expect, it, vi } from 'vitest'

import { isTransientUploadError, retryTransientUpload } from '@/platform/file/upload-retry'

describe('transient upload retry', () => {
  it.each([502, 503, 504])('retries HTTP %s with a bounded backoff', async (status) => {
    vi.useFakeTimers()
    const upload = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ response: { status } })
      .mockResolvedValue('uploaded')

    const result = retryTransientUpload(upload, { delaysMs: [10] })
    await vi.runAllTimersAsync()

    await expect(result).resolves.toBe('uploaded')
    expect(upload).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('does not retry a business validation failure', async () => {
    const error = { response: { status: 400 } }
    const upload = vi.fn<() => Promise<void>>().mockRejectedValue(error)

    await expect(retryTransientUpload(upload, { delaysMs: [0, 0] })).rejects.toBe(error)
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('recognizes connection and timeout failures as transient', () => {
    expect(isTransientUploadError({ code: 'ERR_NETWORK' })).toBe(true)
    expect(isTransientUploadError({ code: 'ECONNABORTED' })).toBe(true)
    expect(isTransientUploadError(new Error('validation failed'))).toBe(false)
  })
})
