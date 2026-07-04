import { describe, expect, it } from 'vitest'

import {
  flattenArchiveTemplateItems,
  parseAllowedFileTypes,
} from '../archive-template'

describe('archive template helpers', () => {
  it('parses stored file types into unique selectable values', () => {
    expect(parseAllowedFileTypes('pdf, docx,pdf,,jpg')).toEqual([
      'pdf',
      'docx',
      'jpg',
    ])
  })

  it('flattens a directory tree while preserving display depth', () => {
    const result = flattenArchiveTemplateItems([
      {
        id: 'root',
        name: '项目资料',
        children: [{ id: 'child', name: '项目计划', children: [] }],
      },
    ])

    expect(result).toEqual([
      { id: 'root', label: '项目资料' },
      { id: 'child', label: '　项目计划' },
    ])
  })
})
