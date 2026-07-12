import { expect, test } from '@playwright/test'

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
  timestamp: string
  traceId: string
}

test.describe('real NestJS API smoke', () => {
  test('liveness endpoint uses the production response envelope', async ({ request }) => {
    const response = await request.get('/api/v1/health')

    expect(response.status()).toBe(200)
    const body = (await response.json()) as ApiEnvelope<string>
    expect(body).toMatchObject({ code: 0, message: 'success', data: 'OK' })
    expect(body.timestamp).toEqual(expect.any(String))
    expect(body.traceId).toEqual(expect.any(String))
  })

  test('readiness confirms the real database, cache and object storage', async ({ request }) => {
    const response = await request.get('/api/v1/ready')

    expect(response.status()).toBe(200)
    const body = (await response.json()) as ApiEnvelope<{
      status: string
      checks: Record<string, string>
    }>
    expect(body.data).toEqual({
      status: 'ready',
      checks: { database: 'ok', redis: 'ok', storage: 'ok' },
    })
  })
})
