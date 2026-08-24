import { describe, expect, it } from 'vitest'

import { summarizeArchiveProgress } from '@/domains/archive/utils/archive-progress'

describe('project archive folder progress', () => {
  it('calculates overall completion from completed folders and directory scale', () => {
    const folders = Array.from({ length: 37 }, (_, index) => ({
      totalCount: index < 4 ? (index === 0 ? 2 : 1) : 0,
      completedCount: index < 4 ? (index === 0 ? 2 : 1) : 0,
    }))

    expect(summarizeArchiveProgress(folders)).toEqual({
      directoryScale: 37,
      completedFolders: 4,
      completionRate: 11,
    })
  })

  it('does not treat an incomplete multi-file folder as complete', () => {
    expect(
      summarizeArchiveProgress([
        { totalCount: 2, completedCount: 1 },
        { totalCount: 1, completedCount: 1 },
      ]),
    ).toEqual({ directoryScale: 2, completedFolders: 1, completionRate: 50 })
  })

  it('returns zero for an empty directory template', () => {
    expect(summarizeArchiveProgress([])).toEqual({
      directoryScale: 0,
      completedFolders: 0,
      completionRate: 0,
    })
  })
})
