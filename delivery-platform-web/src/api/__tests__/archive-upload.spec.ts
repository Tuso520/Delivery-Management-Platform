import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/api/request', () => ({ default: request }))

import { archiveApi } from '@/domains/archive/api/archive.api'
import { fileApi } from '@/platform/file/file.api'

describe('project archive upload contract', () => {
  beforeEach(() => {
    vi.useRealTimers()
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

  it('marks each batch file as a new independent logical file', async () => {
    const file = new File(['archive content'], 'drawing.pdf', {
      type: 'application/pdf',
    })

    await archiveApi.uploadFile('project-1', 'item-1', file, {
      uploadMode: 'REPLACE',
      revisionLevel: 'MINOR',
      createNewLogicalFile: true,
    })

    const [, body] = request.post.mock.calls[0]
    expect((body as FormData).get('createNewLogicalFile')).toBe('true')
    expect((body as FormData).get('logicalFileId')).toBeNull()
  })

  it('retries a transient 503 with the same idempotency key and fresh multipart data', async () => {
    vi.useFakeTimers()
    request.post
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValue({ id: 'logical-1' })
    const file = new File(['archive content'], 'drawing.pdf', {
      type: 'application/pdf',
    })

    const upload = archiveApi.uploadFile('project-1', 'item-1', file, {
      uploadMode: 'REPLACE',
      revisionLevel: 'MINOR',
      createNewLogicalFile: true,
    })
    await vi.runAllTimersAsync()
    await expect(upload).resolves.toEqual({ id: 'logical-1' })

    expect(request.post).toHaveBeenCalledTimes(2)
    const firstOptions = request.post.mock.calls[0][2]
    const secondOptions = request.post.mock.calls[1][2]
    expect(firstOptions.headers['Idempotency-Key']).toBe(secondOptions.headers['Idempotency-Key'])
    expect(firstOptions.silent).toBe(true)
    expect(request.post.mock.calls[0][1]).not.toBe(request.post.mock.calls[1][1])
    expect((request.post.mock.calls[1][1] as FormData).get('file')).toBe(file)
  })

  it('deletes a displayed archive row through logical-file archival', async () => {
    request.post.mockResolvedValue({ id: 'logical-1', archivedAt: '2026-07-28T00:00:00.000Z' })

    await fileApi.archive('logical-1')

    expect(request.post).toHaveBeenCalledWith('/files/logical-1/archive')
  })
})
