import { describe, expect, it } from 'vitest'

import type { KnowledgeItem, KnowledgeVersion } from '@/domains/knowledge/types/knowledge'
import {
  knowledgeMaterialName,
  selectKnowledgeDisplayVersion,
} from '@/domains/knowledge/utils/knowledge-display'

function version(
  contentType: KnowledgeVersion['contentType'],
  overrides: Partial<KnowledgeVersion> = {},
): KnowledgeVersion {
  return {
    id: 'version-1',
    knowledgeItemId: 'knowledge-1',
    version: 'V1.0',
    contentType,
    fileVersionId: null,
    fileVersion: null,
    markdownContent: contentType === 'MARKDOWN' ? '# 指南' : null,
    externalUrl: contentType === 'LINK' ? 'https://example.com/guide' : null,
    supportingFiles: [],
    status: 'PUBLISHED',
    revision: 1,
    changeDescription: null,
    submittedBy: 'user-1',
    submitter: null,
    publishedAt: '2026-08-17T00:00:00.000Z',
    archivedAt: null,
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
    ...overrides,
  }
}

function item(displayVersion: KnowledgeVersion | null): KnowledgeItem {
  return {
    id: 'knowledge-1',
    title: '现场调试指南',
    categoryId: 'category-1',
    summary: null,
    contentType: displayVersion?.contentType ?? 'MARKDOWN',
    status: 'PUBLISHED',
    currentPublishedVersionId: displayVersion?.id ?? null,
    currentPublishedVersion: displayVersion,
    displayVersion,
    effectiveAt: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    creator: null,
    updater: null,
    category: null,
    archivedAt: null,
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  }
}

describe('knowledge display formatting', () => {
  it('uses the real file name and adds a missing extension exactly once', () => {
    const file = version('FILE', {
      fileVersionId: 'file-version-1',
      fileVersion: {
        id: 'file-version-1',
        logicalFileId: 'logical-file-1',
        version: '1',
        status: 'APPROVED',
        asset: {
          id: 'asset-1',
          originalName: '现场调试指南',
          extension: 'pdf',
          mimeType: 'application/pdf',
          size: 1024,
        },
      },
    })
    expect(knowledgeMaterialName(item(file))).toBe('现场调试指南.pdf')

    file.fileVersion!.asset.originalName = '现场调试指南.PDF'
    expect(knowledgeMaterialName(item(file))).toBe('现场调试指南.PDF')
  })

  it('formats non-file primary content as recognizable material names', () => {
    expect(knowledgeMaterialName(item(version('MARKDOWN')))).toBe('现场调试指南.md')
    expect(knowledgeMaterialName(item(version('LINK')))).toBe('现场调试指南.url')
  })

  it('falls back to a visible detail version when an older response has no displayVersion', () => {
    const markdown = version('MARKDOWN')
    const knowledge = item(null)
    knowledge.versions = [markdown]
    knowledge.currentPublishedVersionId = markdown.id

    expect(selectKnowledgeDisplayVersion(knowledge)).toBe(markdown)
  })
})
