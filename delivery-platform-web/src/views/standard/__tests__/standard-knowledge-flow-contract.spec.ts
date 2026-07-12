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

  it('uses target standard APIs for summary, versions, relations and review', () => {
    const source = readSource('src/views/standard/index.vue')
    const queries = readSource('src/composables/queries/useContentQueries.ts')

    expect(source).toContain('useStandardSummaryQuery()')
    expect(queries).toContain('queryFn: standardApi.getSummary')
    expect(source).toContain('standardApi.createVersion(')
    expect(source).toContain('useStandardRelationsQuery(selectedDetailId)')
    expect(queries).toContain('standardApi.getRelations(toValue(standardId))')
    expect(source).toContain('standardApi.submitReview(')
    expect(source).toContain('standardApi.archive(')
    expect(source).toContain('useMutation({')
    expect(source).toContain('queryKeys.standards.detail(')
    expect(source).toContain("t('standard.readonlyHint')")
    expect(source).not.toContain('templateApi.')
    expect(source).not.toContain('workflowApi.')
    expect(source).not.toContain('checklistApi.')
    expect(source).not.toContain('legacySource')
  })

  it('supports all three knowledge content types with explicit versions', () => {
    const source = readSource('src/views/knowledge/index.vue')

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
  })

  it('drives standard and knowledge detail drawers from path params', () => {
    const standard = readSource('src/views/standard/index.vue')
    const knowledge = readSource('src/views/knowledge/index.vue')

    expect(standard).toContain('firstRouteParam(route.params.id)')
    expect(standard).toContain("name: 'StandardDetail'")
    expect(knowledge).toContain('firstRouteParam(route.params.id)')
    expect(knowledge).toContain("name: 'KnowledgeDetail'")
    expect(standard).not.toContain("query: { mode: 'view', id:")
    expect(knowledge).not.toContain("query: { mode: 'view', id:")
  })

  it('uses controlled draft-file uploads and never asks users for internal file ids', () => {
    const standard = readSource('src/views/standard/index.vue')
    const knowledge = readSource('src/views/knowledge/index.vue')

    expect(standard).toContain('standardApi.uploadDraftFile(')
    expect(knowledge).toContain('knowledgeApi.uploadDraftFile(')
    expect(standard).not.toContain('请输入文件版本编号')
    expect(knowledge).not.toContain('请输入文件版本编号')
  })
})
