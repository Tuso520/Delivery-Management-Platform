import type { KnowledgePrimaryContentPayload } from '../api/knowledge.api'
import type { KnowledgeContentType } from '../types/knowledge'

export type KnowledgeContentValidationKey =
  | 'knowledge.validation.fileRequired'
  | 'knowledge.validation.markdownRequired'
  | 'knowledge.validation.linkInvalid'

export function validateKnowledgeContent(
  contentType: KnowledgeContentType,
  fileVersionId: string,
  hasSelectedFile: boolean,
  markdownContent: string,
  externalUrl: string,
): KnowledgeContentValidationKey | null {
  if (contentType === 'FILE' && !fileVersionId.trim() && !hasSelectedFile) {
    return 'knowledge.validation.fileRequired'
  }
  if (contentType === 'MARKDOWN' && !markdownContent.trim()) {
    return 'knowledge.validation.markdownRequired'
  }
  if (contentType === 'LINK') {
    try {
      const url = new URL(externalUrl)
      if (!['http:', 'https:'].includes(url.protocol)) return 'knowledge.validation.linkInvalid'
    } catch {
      return 'knowledge.validation.linkInvalid'
    }
  }
  return null
}

export function knowledgeContentPayload(
  contentType: KnowledgeContentType,
  fileVersionId: string,
  markdownContent: string,
  externalUrl: string,
): KnowledgePrimaryContentPayload {
  if (contentType === 'FILE') {
    return {
      contentType,
      fileVersionId: fileVersionId.trim(),
      markdownContent: null,
      externalUrl: null,
    }
  }
  if (contentType === 'MARKDOWN') {
    return {
      contentType,
      fileVersionId: null,
      markdownContent: markdownContent.trim(),
      externalUrl: null,
    }
  }
  return {
    contentType,
    fileVersionId: null,
    markdownContent: null,
    externalUrl: externalUrl.trim(),
  }
}
