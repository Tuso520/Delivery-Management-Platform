import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('@/api/request', () => ({ default: mocks }))

import { fileApi } from '@/platform/file/file.api'

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

  it('passes a PPTX outline to the presentation fallback viewer', async () => {
    const slides = [{ slideNumber: 1, title: '生产回归', texts: ['生产回归', '内容完整'] }]
    mocks.get.mockResolvedValueOnce(
      previewSession({
        viewerType: 'PRESENTATION_OUTLINE',
        extension: 'pptx',
        availability: { state: 'READY' },
        presentation: { slides },
      }),
    )

    const session = await fileApi.createPreviewSession('file-1')

    expect(session.route).toEqual(
      expect.objectContaining({ viewer: 'presentation-outline', category: 'office' }),
    )
    expect(session.presentation?.slides).toEqual(slides)
  })

  it('loads preview bytes through the authenticated API route', async () => {
    const blob = new Blob(['knowledge main file'], { type: 'text/markdown' })
    mocks.get.mockResolvedValueOnce(blob)

    await expect(fileApi.loadPreviewContent('file-1')).resolves.toBe(blob)
    expect(mocks.get).toHaveBeenCalledWith('/files/file-1/preview-content', {
      responseType: 'blob',
      timeout: 120000,
    })
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
