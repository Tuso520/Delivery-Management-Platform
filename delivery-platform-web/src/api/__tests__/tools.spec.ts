import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}))

vi.mock('@/api/request', () => ({ default: mocks }))

import { toolApi } from '@/api/tools'

describe('target tool API contract', () => {
  beforeEach(() => Object.values(mocks).forEach((mock) => mock.mockReset()))

  it('uses one list endpoint and the management visibility flag', () => {
    toolApi.getList()
    toolApi.getList({ includeDisabled: true })

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/tools')
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/tools', {
      params: { includeDisabled: true },
    })
  })

  it('creates and patches target tool definitions', () => {
    const payload = {
      name: 'PDF 压缩',
      category: 'PDF 工具',
      toolType: 'INTERNAL' as const,
      routeOrUrl: '/tools/pdf-compress',
      configuration: { maxSizeMb: 50 },
    }

    toolApi.create(payload)
    toolApi.update('tool-1', { name: 'PDF 批量压缩' })

    expect(mocks.post).toHaveBeenCalledWith('/tools', payload)
    expect(mocks.patch).toHaveBeenCalledWith('/tools/tool-1', {
      name: 'PDF 批量压缩',
    })
  })

  it('uses state commands instead of delete operations', () => {
    toolApi.enable('tool-1')
    toolApi.disable('tool-1')

    expect(mocks.post).toHaveBeenNthCalledWith(1, '/tools/tool-1/enable')
    expect(mocks.post).toHaveBeenNthCalledWith(2, '/tools/tool-1/disable')
  })
})
