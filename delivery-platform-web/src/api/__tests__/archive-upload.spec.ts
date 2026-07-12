import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/api/request', () => ({ default: request }))

import { archiveApi } from '@/api/archive'

describe('project archive upload contract', () => {
  beforeEach(() => {
    request.get.mockReset()
    request.post.mockReset()
  })

  it('sends a stable idempotency key with target upload metadata', async () => {
    const file = new File(['archive content'], 'acceptance.pdf', {
      type: 'application/pdf',
    })

    await archiveApi.uploadFile('project-1', 'item-1', file, {
      uploadMode: 'NEW_VERSION',
      revisionLevel: 'MINOR',
      logicalFileId: 'logical-1',
      changeDescription: '补充签字页',
    })

    const [path, body, options] = request.post.mock.calls[0]
    expect(path).toBe('/projects/project-1/archive-items/item-1/files')
    expect((body as FormData).get('file')).toBe(file)
    expect((body as FormData).get('logicalFileId')).toBe('logical-1')
    expect(options.headers).toEqual(
      expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
    )
  })
})
