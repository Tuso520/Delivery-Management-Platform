import { describe, expect, it } from 'vitest'

import { findEmptyUploadFileNames } from '../upload-validation'

describe('findEmptyUploadFileNames', () => {
  it('returns every zero-byte file before a batch upload starts', () => {
    expect(
      findEmptyUploadFileNames([
        { name: '投标文件.ppt', size: 0 },
        { name: '技术方案.doc', size: 24_576 },
        { name: '报价说明.doc', size: 0 },
      ]),
    ).toEqual(['投标文件.ppt', '报价说明.doc'])
  })

  it('allows non-empty legacy Office files', () => {
    expect(
      findEmptyUploadFileNames([
        { name: '投标文件.ppt', size: 259_584 },
        { name: '技术方案.doc', size: 24_576 },
      ]),
    ).toEqual([])
  })
})
