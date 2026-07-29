import type { ProjectArchiveTargetItem } from '@/domains/archive/types/archive'

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
