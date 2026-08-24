import { describe, expect, it } from 'vitest'

import type { ProjectArchiveTargetItem } from '@/domains/archive/types/archive'
import {
  isEmptyStandardFolderPlaceholder,
  resolveArchiveUploadTargetLabel,
  resolveProjectArchiveFileName,
} from '../project-archive-file'

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

describe('resolveArchiveUploadTargetLabel', () => {
  it('keeps the template folder and concrete archive item name', () => {
    expect(resolveArchiveUploadTargetLabel('设计管理', '施工图纸')).toBe('设计管理 / 施工图纸')
  })

  it('removes the shared 项目交付文件 suffix', () => {
    expect(resolveArchiveUploadTargetLabel('项目启动', '项目交付文件')).toBe('项目启动')
  })

  it('removes the shared 相关交付文件 suffix', () => {
    expect(resolveArchiveUploadTargetLabel('项目启动', '相关交付文件')).toBe('项目启动')
  })

  it('does not repeat an item name that is identical to its folder', () => {
    expect(resolveArchiveUploadTargetLabel('验收资料', '验收资料')).toBe('验收资料')
  })
})

describe('isEmptyStandardFolderPlaceholder', () => {
  it('hides only an empty standard-folder placeholder from the file table', () => {
    const item = archiveItem(null)
    item.name = '相关交付文件'
    item.sourceStableKey = 'standard-folder-01-files'

    expect(isEmptyStandardFolderPlaceholder(item)).toBe(true)

    item.fileCount = 1
    expect(isEmptyStandardFolderPlaceholder(item)).toBe(false)

    item.fileCount = 0
    item.sourceStableKey = 'custom-item'
    expect(isEmptyStandardFolderPlaceholder(item)).toBe(false)
  })
})
