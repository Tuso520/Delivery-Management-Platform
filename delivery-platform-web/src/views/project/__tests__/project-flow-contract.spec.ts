import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
}

describe('project overview flow contract', () => {
  it('keeps summary filtering, sorting and the shared extra-large project drawer', () => {
    const source = readSource('src/views/project/index.vue')
    const queries = readSource('src/composables/queries/useProjectQueries.ts')

    expect(source).toContain('useProjectSummaryQuery()')
    expect(queries).toContain('queryFn: projectApi.getSummary')
    expect(source).toMatch(/summaryFilter:\s*typeof route\.query\.summaryFilter/u)
    expect(source).toMatch(/sort:\s*typeof route\.query\.sort/u)
    expect(source).toContain("'updatedAt:desc'")
    expect(source).toContain('<BusinessDrawer')
    expect(source).toContain('size="xl"')
    expect(source).toContain("router.push('/projects/create')")
  })

  it('does not submit command-owned fields through ordinary project editing', () => {
    const form = readSource('src/views/project/create.vue')

    expect(form).toContain('saveProjectMutation.mutateAsync')
    expect(form).toContain('data: { ...commonPayload, revision: currentProject.revision }')
    expect(form).not.toContain('currentStage: formData')
    expect(form).not.toContain('projectStatus: formData')
    expect(form).not.toContain('actualEndDate: formData')
    expect(form).toContain('if (canEditFinancial.value)')
    expect(form).toContain('if (canEditContract.value)')
    expect(form).toContain('revision: currentProject.revision')
  })

  it('uses one stable create key and requires a published archive template', () => {
    const form = readSource('src/views/project/create.vue')
    const api = readSource('src/api/project.ts')
    const queries = readSource('src/composables/queries/useProjectQueries.ts')

    expect(form).toContain('const createIdempotencyKey = ref(createDraftIdempotencyKey())')
    expect(form).toContain('idempotencyKey: createIdempotencyKey.value')
    expect(
      form.match(/createIdempotencyKey\.value = createDraftIdempotencyKey\(\)/gu),
    ).toHaveLength(2)
    expect(api).toContain("headers: { 'Idempotency-Key': idempotencyKey }")
    expect(form).toContain('field="archiveTemplateId"')
    expect(form).toContain('archiveTemplateId: formData.archiveTemplateId')
    expect(form).toContain("template.status === 'PUBLISHED'")
    expect(form).toContain("template.currentPublishedVersion?.status === 'PUBLISHED'")
    expect(queries).toContain('queryKeys.projects.archiveTemplateOptions()')
    expect(form).toContain("t('projects.createForm.purchaseOwner')")
    expect(form).toContain("t('projects.createForm.financeOwner')")
  })

  it('routes stage, status and acceptance changes through dedicated commands', () => {
    const detail = readSource('src/views/project/detail.vue')
    const overview = readSource('src/views/project/index.vue')
    const types = readSource('src/types/project.ts')

    expect(detail).toContain('projectApi.updateStage(')
    expect(detail).toContain('projectApi.changeStatus(')
    expect(detail).toContain('projectApi.updateAcceptance(')
    expect(detail).toContain('revision: currentProjectRevision()')
    expect(detail).toContain("t('projects.conflict')")
    expect(detail).toContain('queryClient.setQueryData(queryKeys.projects.detail(projectId)')
    expect(overview).toContain('revision: row.revision')
    expect(overview).toContain('queryClient.setQueryData(queryKeys.projects.detail(variables.id)')
    expect(types).toMatch(/interface UpdateProjectStageDto \{\s+revision: number/u)
    expect(types).toMatch(/interface UpdateProjectAcceptanceDto \{\s+revision: number/u)
    expect(types).toMatch(/interface ProjectStatusActionDto \{\s+revision: number/u)
    expect(detail).not.toContain("router.push('/project')")
    expect(detail).not.toContain('router.push(`/project/')
  })

  it('gates permanent deletion and requires two explicit high-risk confirmations', () => {
    const overview = readSource('src/views/project/index.vue')
    const api = readSource('src/api/project.ts')

    expect(overview).toContain('<Can permission="project:delete">')
    expect(overview).toContain('await arcoConfirm(')
    expect(overview).toContain('await arcoPrompt(')
    expect(overview).toContain("t('projects.deleteCodeMismatch')")
    expect(overview).toContain('projectDeleteMutation.mutateAsync(row.id)')
    expect(overview).toContain('error.response?.data')
    expect(overview).toContain('Message.error(deleteErrorMessage(error))')
    expect(api).toContain('request.delete<void>(`/projects/${id}`, { silent: true })')
  })

  it('renders permission-filtered financial and acceptance fields safely', () => {
    const list = readSource('src/views/project/index.vue')
    const detail = readSource('src/views/project/detail.vue')

    expect(list).toContain('row.contractAmount != null && row.contractCurrency')
    expect(list).toContain("project.acceptanceTimeType === 'ACTUAL'")
    expect(detail).toContain('project.convertedAmount != null && project.baseCurrency')
    expect(detail).toContain("project.acceptanceTimeType === 'NONE'")
  })

  it('submits archive templates for review without a direct publish bypass', () => {
    const template = readSource('src/views/archive/template.vue')
    const api = readSource('src/api/archive-template.ts')

    expect(template).toContain('archiveTemplateApi.submitReview(')
    expect(template).not.toContain('archive_template:publish')
    expect(template).not.toContain('archiveTemplateApi.publish(')
    expect(template).not.toContain("record.status === 'Active'")
    expect(template).not.toContain('archiveTemplate.status.Active')
    expect(template).toContain("record.status !== 'DISABLED'")
    expect(api).not.toContain('/archive-template-versions/${versionId}/publish')
  })
})
