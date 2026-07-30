import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
}

describe('standard and knowledge target flows', () => {
  it('routes the primary standard entry to the unified standard page', () => {
    const router = readSource('src/router/index.ts')

    expect(router).toContain("path: '/standards'")
    expect(router).toContain("const StandardView = () => import('@/views/standard/index.vue')")
    expect(router).toContain("permissions: ['standard:view']")
    expect(router).not.toContain("path: 'workflow'")
    expect(router).not.toContain("path: 'workflow/detail/:id'")
    expect(router).not.toContain("path: 'checklist'")
    expect(router).not.toContain("path: 'checklist/template/:id'")
    expect(router).not.toContain("path: 'template/create'")
    expect(router).not.toContain("path: 'template/:id'")
    expect(router).not.toContain("path: 'standards/create'")
    expect(router).toContain("path: '/standards/:id(")
    expect(router).toContain("path: '/knowledge/:id(")
    expect(router).not.toContain('legacySource')
    expect(router).not.toContain('legacyId')
  })

  it('removes the retired workflow, checklist-template and document-template frontends', () => {
    const retiredFiles = [
      'src/views/workflow/index.vue',
      'src/views/workflow/detail.vue',
      'src/views/checklist/template/index.vue',
      'src/views/checklist/template/template-detail.vue',
      'src/views/template/index.vue',
      'src/views/template/detail.vue',
      'src/api/workflow.ts',
      'src/api/checklist.ts',
      'src/api/template.ts',
      'src/types/workflow.ts',
      'src/types/checklist.ts',
      'src/types/template.ts',
    ]

    expect(retiredFiles.filter((file) => existsSync(resolve(process.cwd(), file)))).toEqual([])
  })

  it('uses target standard APIs for summary, configured categories, versions and review', () => {
    const source = readSource('src/views/standard/index.vue')
    const types = readSource('src/types/standard.ts')
    const queries = readSource('src/composables/queries/useContentQueries.ts')

    expect(source).toContain('useStandardSummaryQuery()')
    expect(queries).toContain('queryFn: standardApi.getSummary')
    expect(source).toContain('useStandardCategoryCountsQuery(dimension, appliedKeyword)')
    expect(queries).toContain('standardApi.getCategoryCounts(')
    expect(source).toContain('standardApi.createVersion(')
    expect(source).toContain('standardApi.submitReview(')
    expect(source).toContain('standardApi.archive(')
    expect(source).toContain('useMutation({')
    expect(source).toContain('queryKeys.standards.detail(id)')
    expect(source).toContain("useFieldConfig('standard')")
    expect(source).not.toContain('useStandardRelationsQuery(')
    expect(source).not.toContain('templateApi.')
    expect(source).not.toContain('workflowApi.')
    expect(source).not.toContain('checklistApi.')
    expect(source).not.toContain('legacySource')
    expect(source).not.toContain('ONLINE')
    expect(source).not.toContain('structuredContent')
    expect(source).not.toContain('applicability')
    expect(types).not.toContain('structuredContent')
    expect(types).not.toContain('applicability')
    expect(types).toContain('fileVersionId: string')
  })

  it('removes the retired online-standard copy from both locales', () => {
    for (const file of ['src/locales/zh-CN.json', 'src/locales/en-US.json']) {
      const locale = JSON.parse(readSource(file)) as {
        standard: {
          fields: Record<string, unknown>
          validation: Record<string, unknown>
          messages: Record<string, unknown>
          [key: string]: unknown
        }
      }

      expect(locale.standard).not.toHaveProperty('readonly')
      expect(locale.standard).not.toHaveProperty('onlineContent')
      expect(locale.standard).not.toHaveProperty('managedFile')
      expect(locale.standard).not.toHaveProperty('noContent')
      expect(locale.standard).not.toHaveProperty('standardContent')
      expect(locale.standard).not.toHaveProperty('contentBody')
      expect(locale.standard).not.toHaveProperty('contentMode')
      expect(locale.standard).not.toHaveProperty('markdownPlaceholder')
      expect(locale.standard.fields).not.toHaveProperty('content')
      expect(locale.standard.fields).toHaveProperty('fileName')
      expect(locale.standard.validation).not.toHaveProperty('contentRequired')
      expect(locale.standard.validation).not.toHaveProperty('versionContentRequired')
      expect(locale.standard.messages).not.toHaveProperty('onlineNoDownload')
    }
  })

  it('supports all three knowledge content types with explicit versions', () => {
    const source = readSource('src/domains/knowledge/pages/KnowledgePage.vue')
    const api = readSource('src/domains/knowledge/api/knowledge.api.ts')

    expect(source).toContain("{ value: 'FILE', label: 'knowledge.contentTypes.FILE' }")
    expect(source).toContain("{ value: 'MARKDOWN', label: 'Markdown' }")
    expect(source).toContain("{ value: 'LINK', label: 'knowledge.contentTypes.LINK' }")
    expect(source).toContain('knowledgeApi.createVersion(')
    expect(source).toContain('knowledgeApi.submitReview(')
    expect(source).toContain('knowledgeApi.archive(')
    expect(source).toContain("t('knowledge.readonlyHint')")
    expect(source).not.toContain('knowledgeApi.getArticles(')
    expect(source).not.toContain('approvalApi.')
    expect(source).toContain('firstRouteParam(route.params.id)')
    expect(source).toContain("name: 'KnowledgeDetail'")
    expect(source).toContain("kind: 'create'")
    expect(source).toContain("kind: 'update'")
    expect(source).toContain("['DRAFT', 'REJECTED'].includes(source.status)")
    expect(api).toContain('export type KnowledgePrimaryContentPayload')
    expect(api).toContain('supportingFileVersionIds: string[]')
    expect(api).toContain('UpdateKnowledgeVersionPayload')
  })

  it('drives standard and knowledge detail drawers from path params', () => {
    const standard = readSource('src/views/standard/index.vue')
    const knowledge = readSource('src/domains/knowledge/pages/KnowledgePage.vue')

    expect(standard).toContain('firstRouteParam(value)')
    expect(standard).toContain("name: 'StandardDetail'")
    expect(knowledge).toContain('firstRouteParam(route.params.id)')
    expect(knowledge).toContain("name: 'KnowledgeDetail'")
    expect(standard).not.toContain("query: { mode: 'view', id:")
    expect(knowledge).not.toContain("query: { mode: 'view', id:")
  })

  it('uses the dedicated Figma frames for both standard and knowledge libraries', () => {
    const standard = readSource('src/views/standard/index.vue')
    const knowledge = readSource('src/domains/knowledge/pages/KnowledgePage.vue')

    expect(standard).toContain('<section class="standard-library">')
    expect(standard).toContain('<div class="metrics">')
    expect(standard).toContain('<div class="toolbar">')
    expect(standard).toContain('<aside class="category-sidebar">')
    expect(standard).toContain('<table class="standard-table">')
    expect(standard).toContain('width: auto')
    expect(standard).toContain('min-width: 937px')
    expect(standard).toContain('width: 90px')
    expect(standard).toContain('width: 130px')
    expect(standard).toContain('width: 170px')
    expect(standard).toContain('width: 182px')
    expect(standard).toContain('height: 44px')
    expect(standard).not.toContain('<PageToolbar')
    expect(standard).not.toContain('<BusinessTable')
    expect(standard).toContain('@click="previewStandard(row)"')
    expect(standard).toContain('{{ standardFileName(row) }}')
    expect(standard).toContain("{{ t('standard.create') }}")
    expect(standard).not.toContain('@click="downloadStandard(row)"')
    expect(knowledge).toContain('<section class="knowledge-library">')
    expect(knowledge).toContain('<section class="knowledge-metrics"')
    expect(knowledge).toContain('<section class="knowledge-toolbar"')
    expect(knowledge).toContain('<aside class="knowledge-categories"')
    expect(knowledge).toContain('<table class="knowledge-table">')
    expect(knowledge).toContain('minWidth: 365')
    expect(knowledge).toContain('minWidth: 90')
    expect(knowledge).toContain('minWidth: 130')
    expect(knowledge).toContain('minWidth: 170')
    expect(knowledge).toContain('minWidth: 182')
    expect(knowledge).toContain('const KNOWLEDGE_TABLE_MIN_WIDTH = 937')
    expect(knowledge).toContain('columnWidthPercentage(column)')
    expect(knowledge).not.toContain('height: 625px')
    expect(knowledge).not.toContain('flex: 0 0 625px')
    expect(knowledge).toContain('height: 44px')
    expect(knowledge).not.toContain('<PageToolbar')
    expect(knowledge).toContain('<BusinessTable')
  })

  it('uses controlled draft-file uploads and never asks users for internal file ids', () => {
    const standard = readSource('src/views/standard/index.vue')
    const knowledge = readSource('src/domains/knowledge/pages/KnowledgePage.vue')

    expect(standard).toContain('standardApi.uploadDraftFile(')
    expect(knowledge).toContain('knowledgeApi.uploadDraftFile(')
    expect(standard).not.toContain('请输入文件版本编号')
    expect(knowledge).not.toContain('请输入文件版本编号')
  })
})
