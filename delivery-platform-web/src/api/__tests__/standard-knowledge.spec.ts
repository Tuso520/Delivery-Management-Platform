import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/api/request', () => ({ default: mocks }))

import { knowledgeApi } from '@/api/knowledge'
import { standardApi } from '@/api/standard'

describe('standard target API contract', () => {
  beforeEach(() => Object.values(mocks).forEach((mock) => mock.mockReset()))

  it('uses the unified standard summary, list and detail endpoints', () => {
    const params = { page: 2, pageSize: 20, keyword: '验收', status: 'PUBLISHED' as const }

    standardApi.getSummary()
    standardApi.getList(params)
    standardApi.getById('standard-1')

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/standards/summary')
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/standards', { params })
    expect(mocks.get).toHaveBeenNthCalledWith(3, '/standards/standard-1')
  })

  it('creates explicit versions, submits unified review and archives softly', () => {
    const version = { version: 'V2.0', structuredContent: { markdown: '# 修订' } }

    standardApi.createVersion('standard-1', version)
    standardApi.submitReview('version-2')
    standardApi.archive('standard-1')

    expect(mocks.post).toHaveBeenNthCalledWith(1, '/standards/standard-1/versions', version)
    expect(mocks.post).toHaveBeenNthCalledWith(2, '/standard-versions/version-2/submit-review', {})
    expect(mocks.post).toHaveBeenNthCalledWith(3, '/standards/standard-1/archive')
  })

  it('creates standards and uses PATCH for master-data edits', () => {
    const createPayload = {
      code: 'SOP-001',
      name: '交付作业规范',
      type: 'SOP',
      structuredContent: { markdown: '# 正文' },
    }

    standardApi.create(createPayload)
    standardApi.update('standard-1', { name: '交付作业规范 V2' })

    expect(mocks.post).toHaveBeenCalledWith('/standards', createPayload)
    expect(mocks.patch).toHaveBeenCalledWith('/standards/standard-1', {
      name: '交付作业规范 V2',
    })
  })

  it('maintains relations only between standards', () => {
    const relation = { targetStandardId: 'standard-2', relationType: 'REFERENCES' as const }

    standardApi.getRelations('standard-1')
    standardApi.createRelation('standard-1', relation)
    standardApi.deleteRelation('standard-1', 'relation-1')

    expect(mocks.get).toHaveBeenCalledWith('/standards/standard-1/relations')
    expect(mocks.post).toHaveBeenCalledWith('/standards/standard-1/relations', relation)
    expect(mocks.delete).toHaveBeenCalledWith('/standards/standard-1/relations/relation-1')
  })

  it('uploads controlled standard drafts before linking a file version', async () => {
    const file = new File(['content'], 'delivery-sop.pdf', { type: 'application/pdf' })

    await standardApi.uploadDraftFile(file, '初始版本')

    const [path, body, options] = mocks.post.mock.calls[0]
    expect(path).toBe('/files/drafts')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('file')).toBe(file)
    expect((body as FormData).get('ownerType')).toBe('STANDARD')
    expect((body as FormData).get('changeDescription')).toBe('初始版本')
    expect(options).toEqual(
      expect.objectContaining({
        timeout: 120000,
        headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
      }),
    )
  })
})

describe('knowledge target API contract', () => {
  beforeEach(() => Object.values(mocks).forEach((mock) => mock.mockReset()))

  it('keeps the target item endpoints separate from legacy articles', () => {
    const params = { page: 1, pageSize: 20, keyword: '调试' }

    knowledgeApi.getSummary()
    knowledgeApi.getList(params)
    knowledgeApi.getById('knowledge-1')

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/knowledge/summary')
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/knowledge', { params })
    expect(mocks.get).toHaveBeenNthCalledWith(3, '/knowledge/knowledge-1')
  })

  it('creates FILE, MARKDOWN or LINK content through an explicit version', () => {
    const payload = {
      version: 'V2.0',
      contentType: 'LINK' as const,
      fileVersionId: null,
      markdownContent: null,
      externalUrl: 'https://example.com/guide',
    }

    knowledgeApi.createVersion('knowledge-1', payload)
    knowledgeApi.submitReview('knowledge-version-2')
    knowledgeApi.archive('knowledge-1')

    expect(mocks.post).toHaveBeenNthCalledWith(1, '/knowledge/knowledge-1/versions', payload)
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      '/knowledge-versions/knowledge-version-2/submit-review',
      {},
    )
    expect(mocks.post).toHaveBeenNthCalledWith(3, '/knowledge/knowledge-1/archive')
  })

  it('creates unified knowledge items and uses PATCH for master-data edits', () => {
    const createPayload = {
      title: '现场调试指南',
      categoryId: 'category-1',
      contentType: 'MARKDOWN' as const,
      markdownContent: '# 调试步骤',
    }

    knowledgeApi.create(createPayload)
    knowledgeApi.update('knowledge-1', { summary: '适用于现场交付' })

    expect(mocks.post).toHaveBeenCalledWith('/knowledge', createPayload)
    expect(mocks.patch).toHaveBeenCalledWith('/knowledge/knowledge-1', {
      summary: '适用于现场交付',
    })
  })

  it('uploads controlled knowledge drafts with the required owner type', async () => {
    const file = new File(['content'], 'handover.docx')

    await knowledgeApi.uploadDraftFile(file)

    const [path, body, options] = mocks.post.mock.calls[0]
    expect(path).toBe('/files/drafts')
    expect((body as FormData).get('file')).toBe(file)
    expect((body as FormData).get('ownerType')).toBe('KNOWLEDGE')
    expect(options.headers['Idempotency-Key']).toEqual(expect.any(String))
  })
})
