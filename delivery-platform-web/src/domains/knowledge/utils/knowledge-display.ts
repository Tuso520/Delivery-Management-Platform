import type { KnowledgeItem, KnowledgeVersion } from '@/domains/knowledge/types/knowledge'

function appendExtension(name: string, extension: string): string {
  const normalizedName = name.trim()
  const normalizedExtension = extension.trim().replace(/^\.+/u, '')
  if (!normalizedName || !normalizedExtension) return normalizedName
  if (normalizedName.toLocaleLowerCase().endsWith(`.${normalizedExtension.toLocaleLowerCase()}`)) {
    return normalizedName
  }
  return `${normalizedName}.${normalizedExtension}`
}

export function selectKnowledgeDisplayVersion(item: KnowledgeItem): KnowledgeVersion | null {
  if (item.displayVersion) return item.displayVersion
  const versions = item.versions ?? []
  const currentPublished = versions.find((version) => version.id === item.currentPublishedVersionId)
  return currentPublished ?? versions[0] ?? null
}

export function knowledgeMaterialName(item: KnowledgeItem): string {
  const version = selectKnowledgeDisplayVersion(item)
  if (version?.contentType === 'FILE' && version.fileVersion) {
    return appendExtension(
      version.fileVersion.asset.originalName,
      version.fileVersion.asset.extension ?? '',
    )
  }
  if (version?.contentType === 'MARKDOWN' || item.contentType === 'MARKDOWN') {
    return appendExtension(item.title, 'md')
  }
  if (version?.contentType === 'LINK' || item.contentType === 'LINK') {
    return appendExtension(item.title, 'url')
  }
  return item.title
}
