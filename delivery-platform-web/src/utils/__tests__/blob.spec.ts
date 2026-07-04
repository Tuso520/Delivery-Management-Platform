import { beforeEach, describe, expect, it, vi } from 'vitest'

import { downloadBlob, openBlob } from '../blob'

describe('blob helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:test'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('opens a blob in a new tab', () => {
    const click = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      click,
    } as unknown as HTMLAnchorElement)

    openBlob(new Blob(['preview']))

    expect(click).toHaveBeenCalledOnce()
  })

  it('assigns a file name for downloads', () => {
    const anchor = { click: vi.fn() } as unknown as HTMLAnchorElement
    vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    downloadBlob(new Blob(['download']), 'report.pdf')

    expect(anchor.download).toBe('report.pdf')
    expect(anchor.click).toHaveBeenCalledOnce()
  })
})
