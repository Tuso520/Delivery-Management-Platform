import type { ProjectArchiveTargetItem } from '@/domains/archive/types/archive'

const GENERIC_ARCHIVE_ITEM_NAMES = new Set(['项目交付文件'])

const FILE_EXTENSION_PATTERN = /\.[^./\\]+$/u

export function resolveProjectArchiveFileName(item: ProjectArchiveTargetItem): string {
  const version = item.currentVersion
  const originalName = version?.originalName?.trim()
  const displayName = version?.displayName?.trim()
  const candidate = originalName || displayName || item.name.trim()
  const extension = version?.extension?.trim().replace(/^\./u, '')

  if (!candidate || !extension || FILE_EXTENSION_PATTERN.test(candidate)) return candidate
  return `${candidate}.${extension}`
}

export function resolveArchiveUploadTargetLabel(folderName: string, itemName: string): string {
  const normalizedFolderName = folderName.trim()
  const normalizedItemName = itemName.trim()

  if (!normalizedItemName || GENERIC_ARCHIVE_ITEM_NAMES.has(normalizedItemName)) {
    return normalizedFolderName
  }
  if (!normalizedFolderName || normalizedFolderName === normalizedItemName) {
    return normalizedItemName
  }
  return `${normalizedFolderName} / ${normalizedItemName}`
}
