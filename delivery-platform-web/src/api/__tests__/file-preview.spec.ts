import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('@/api/request', () => ({ default: mocks }))

import { fileApi } from '@/api/file'

describe('unified file preview contract', () => {
  beforeEach(() => mocks.get.mockReset())

  it('renders a completed CAD conversion through the PDF viewer', async () => {
    mocks.get.mockResolvedValueOnce(
      previewSession({
        viewerType: 'CAD_CONVERTED',
        previewUrl: 'https://files.test/drawing-preview.pdf',
        availability: { state: 'READY' },
      }),
    )

    const session = await fileApi.createPreviewSession('file-1')

    expect(session.route).toEqual(
      expect.objectContaining({ viewer: 'pdf', category: 'cad', readonly: true }),
    )
    expect(session.urls.content).toBe('https://files.test/drawing-preview.pdf')
  })

  it('does not expose a source viewer while a required artifact is processing', async () => {
    mocks.get.mockResolvedValueOnce(
      previewSession({
        viewerType: 'UNSUPPORTED',
        availability: {
          state: 'PROCESSING',
          reason: '预览产物正在生成，请稍后重试',
          errorCode: 'FILE_PREVIEW_PROCESSING',
        },
      }),
    )

    const session = await fileApi.createPreviewSession('file-1')

    expect(session.route.viewer).toBe('unavailable')
    expect(session.route.reason).toContain('正在生成')
  })

  it('passes a completed XMind outline to the read-only outline viewer', async () => {
    const sheets = [{ title: '交付计划', root: { title: '启动', children: [] } }]
    mocks.get.mockResolvedValueOnce(
      previewSession({
        viewerType: 'XMIND',
        availability: { state: 'READY' },
        xmind: { sheets },
      }),
    )

    const session = await fileApi.createPreviewSession('file-1')

    expect(session.route.viewer).toBe('xmind')
    expect(session.xmind?.sheets).toEqual(sheets)
  })
})

function previewSession(overrides: Record<string, unknown>) {
  return {
    fileId: 'file-1',
    fileName: 'drawing.dwg',
    mimeType: 'application/octet-stream',
    extension: 'dwg',
    viewerType: 'UNSUPPORTED',
    previewUrl: 'https://files.test/source',
    availability: { state: 'UNAVAILABLE' },
    downloadAllowed: true,
    metadata: { version: 'V1.0', size: '1024', checksum: 'abc', readOnly: true },
    processingStatus: [],
    ...overrides,
  }
}
