import { describe, expect, it } from 'vitest'

import type { ProjectArchiveTargetItem } from '@/domains/archive/types/archive'
import { resolveProjectArchiveFileName } from '../project-archive-file'

function archiveItem(
  currentVersion: ProjectArchiveTargetItem['currentVersion'],
): ProjectArchiveTargetItem {
  return {
    id: 'item-1',
    name: '项目需求沟通记录',
    required: true,
    reviewRequired: false,
    allowMultipleFiles: false,
    isTemporary: false,
    status: 'APPROVED',
    currentVersion,
    fileCount: currentVersion ? 1 : 0,
    updatedAt: '2026-07-20T00:00:00.000Z',
    canUpload: true,
    canDownload: true,
    canDeleteFile: true,
    pendingReviewSummary: { count: 0, tasks: [] },
  }
}

describe('resolveProjectArchiveFileName', () => {
  it('prefers the original uploaded file name including its extension', () => {
    expect(
      resolveProjectArchiveFileName(
        archiveItem({
          id: 'version-1',
          version: 'V1.0',
          status: 'APPROVED',
          uploadedAt: '2026-07-20T00:00:00.000Z',
          originalName: '项目启动会议纪要.docx',
          displayName: '会议纪要',
          extension: 'docx',
        }),
      ),
    ).toBe('项目启动会议纪要.docx')
  })

  it('reliably appends asset metadata when a legacy display name has no extension', () => {
    expect(
      resolveProjectArchiveFileName(
        archiveItem({
          id: 'version-1',
          version: 'V1.0',
          status: 'APPROVED',
          uploadedAt: '2026-07-20T00:00:00.000Z',
          displayName: '项目需求沟通记录',
          extension: '.pdf',
        }),
      ),
    ).toBe('项目需求沟通记录.pdf')
  })

  it('does not invent an extension without file metadata', () => {
    expect(resolveProjectArchiveFileName(archiveItem(null))).toBe('项目需求沟通记录')
  })
})
