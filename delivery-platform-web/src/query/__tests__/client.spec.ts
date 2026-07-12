import { describe, expect, it } from 'vitest'

import { ApiRequestError } from '@/api/errors'
import { shouldRetryQuery } from '@/query/client'

describe('Vue Query retry policy', () => {
  it('does not retry authentication, authorization or business validation failures', () => {
    expect(shouldRetryQuery(0, axiosLikeError(401))).toBe(false)
    expect(shouldRetryQuery(0, axiosLikeError(403))).toBe(false)
    expect(shouldRetryQuery(0, axiosLikeError(422))).toBe(false)
    expect(shouldRetryQuery(0, new ApiRequestError('业务校验失败', undefined, 'VALIDATION', false)))
      .toBe(false)
  })

  it('retries transient query failures at most twice', () => {
    expect(shouldRetryQuery(0, axiosLikeError(503))).toBe(true)
    expect(shouldRetryQuery(1, new Error('network unavailable'))).toBe(true)
    expect(shouldRetryQuery(2, axiosLikeError(503))).toBe(false)
  })
})

function axiosLikeError(status: number): unknown {
  return {
    isAxiosError: true,
    response: { status },
  }
}
