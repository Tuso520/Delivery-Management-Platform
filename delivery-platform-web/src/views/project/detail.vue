<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { projectApi } from '@/api/project'
import { BusinessModal, FormGrid, FormSection, PageToolbar, ReadonlyField, StatusBadge } from '@/components/business'
import { useProjectDetailQuery } from '@/composables/queries/useProjectQueries'
import { queryKeys } from '@/query/keys'
import type { ProjectDeliveryStage } from '@/types/project'
import { PROJECT_DELIVERY_STAGES, STAGE_OPTIONS } from '@/types/project'
import { arcoConfirm } from '@/utils/arco-dialog'
import {
  CONTRACT_TYPE_OPTIONS, PRODUCT_TYPE_OPTIONS, PROJECT_KEYWORD_OPTIONS, PROJECT_STAGE_COLORS,
  PROJECT_TYPE_OPTIONS, findProjectDictionaryOption,
} from '@/utils/project-dictionaries'
import { localizeProjectRisk, localizeProjectStage, localizeProjectStatus } from '@/utils/project-localization'

const props = defineProps<{ embedded?: boolean; projectId: string }>()
const emit = defineEmits<{ edit: []; close: []; changed: [] }>()
const queryClient = useQueryClient()
const { t } = useI18n()
const query = useProjectDetailQuery(() => props.projectId)
const project = computed(() => query.data.value)
const progressVisible = ref(false)
const progressForm = reactive({
  targetStage: 'STARTUP' as ProjectDeliveryStage, progressPercent: 0,
  expectedAcceptanceAt: '', actualAcceptanceAt: '', reason: '',
})
const mutation = useMutation({
  mutationFn: () => {
    if (!project.value) throw new Error('项目尚未加载')
    return projectApi.updateProgress(project.value.id, {
      revision: project.value.revision, targetStage: progressForm.targetStage,
      progressPercent: progressForm.progressPercent,
      expectedAcceptanceAt: progressForm.expectedAcceptanceAt || undefined,
      actualAcceptanceAt: progressForm.actualAcceptanceAt || undefined,
      reason: progressForm.reason.trim() || undefined,
    })
  },
  retry: false,
  onSuccess: async (updated) => {
    queryClient.setQueryData(queryKeys.projects.detail(props.projectId), updated)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.summary() }),
    ])
  },
})
function openProgress(): void {
  if (!project.value) return
  Object.assign(progressForm, {
    targetStage: project.value.currentStage, progressPercent: project.value.progressPercent ?? 0,
    expectedAcceptanceAt: project.value.expectedAcceptanceAt?.slice(0, 10) || '',
    actualAcceptanceAt: project.value.actualAcceptanceAt?.slice(0, 10) || '', reason: '',
  })
  progressVisible.value = true
}
async function saveProgress(): Promise<boolean> {
  const currentIndex = project.value ? PROJECT_DELIVERY_STAGES.indexOf(project.value.currentStage) : -1
  const targetIndex = PROJECT_DELIVERY_STAGES.indexOf(progressForm.targetStage)
  if (targetIndex < currentIndex && !progressForm.reason.trim()) {
    Message.warning('阶段回退必须填写变更说明')
    return false
  }
  await mutation.mutateAsync()
  progressVisible.value = false
  Message.success('项目进度已更新')
  emit('changed')
  return true
}
async function archiveProject(): Promise<void> {
  if (!project.value) return
  await arcoConfirm(`确认归档“${project.value.shortName || project.value.projectName}”？`, '归档项目', { type: 'warning' })
  await arcoConfirm('归档后项目将移入归档列表，可由有权限人员恢复。', '再次确认归档', { type: 'warning', confirmButtonText: '确认归档' })
  const updated = await projectApi.changeStatus(project.value.id, 'archive', { revision: project.value.revision })
  queryClient.setQueryData(queryKeys.projects.detail(props.projectId), updated)
  await queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() })
  Message.success('项目已归档')
  emit('changed')
  emit('close')
}
function date(value?: string | null): string { return value ? value.slice(0, 10) : '—' }
function money(value?: number | null): string { return value == null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value) }
function member(role: string): string { return project.value?.members?.find((item) => item.projectRole === role)?.user?.realName || '—' }
function keyword(value: string) { return PROJECT_KEYWORD_OPTIONS.find((item) => item.value === value) }
</script>

<template>
  <div class="detail-root">
    <PageToolbar>
      <template #actions>
        <a-button v-if="project?.canEdit && !project.archivedAt" type="primary" @click="emit('edit')">
          {{ t('projects.edit') }}
        </a-button>
        <a-button v-if="project?.canUpdateProgress && !project.archivedAt" @click="openProgress">
          {{ t('projects.progress.update') }}
        </a-button>
      </template>
    </PageToolbar>
    <a-spin :loading="query.isFetching.value">
      <a-result v-if="query.isError.value" status="error" :title="t('projects.detailPage.loadFailed')">
        <template #extra>
          <a-button @click="query.refetch()">
            {{ t('common.retry') }}
          </a-button>
        </template>
      </a-result>
      <template v-else-if="project">
        <FormSection :title="t('projects.sections.basic')">
          <FormGrid :columns="4">
            <ReadonlyField :label="t('projects.detailPage.projectCode')" :value="project.projectCode" />
            <ReadonlyField class="span-2" :label="t('projects.createForm.projectName')" :value="project.projectName" />
            <ReadonlyField :label="t('projects.detailPage.shortName')" :value="project.shortName" />
            <ReadonlyField class="span-2" :label="t('projects.detailPage.customer')" :value="project.customerName" />
            <ReadonlyField :label="t('projects.detailPage.region')" :value="`${project.countryName || project.countryCode} / ${project.city || '—'}`" />
            <ReadonlyField :label="t('common.status')">
              <StatusBadge domain="project" :status="project.archivedAt ? 'ARCHIVED' : project.status" :label="project.archivedAt ? t('projects.archived') : localizeProjectStatus(project.status, 'zh-CN')" />
            </ReadonlyField>
            <ReadonlyField :label="t('projects.createForm.projectType')">
              <a-tag v-if="project.projectType" :color="findProjectDictionaryOption(PROJECT_TYPE_OPTIONS, project.projectType)?.color">
                {{ findProjectDictionaryOption(PROJECT_TYPE_OPTIONS, project.projectType)?.label }}
              </a-tag>
            </ReadonlyField>
            <ReadonlyField :label="t('projects.createForm.contractType')">
              <a-tag v-if="project.contractType" :color="findProjectDictionaryOption(CONTRACT_TYPE_OPTIONS, project.contractType)?.color">
                {{ project.contractType }}
              </a-tag>
            </ReadonlyField>
            <ReadonlyField :label="t('projects.createForm.product')">
              <a-tag v-if="project.product" :color="findProjectDictionaryOption(PRODUCT_TYPE_OPTIONS, project.product)?.color">
                {{ findProjectDictionaryOption(PRODUCT_TYPE_OPTIONS, project.product)?.label }}
              </a-tag>
            </ReadonlyField>
            <ReadonlyField class="span-full" :label="t('projects.createForm.keywords')">
              <a-space wrap>
                <a-tag v-for="item in project.keywords" :key="item" :color="keyword(item)?.color">
                  {{ keyword(item)?.label || item }}
                </a-tag><span v-if="!project.keywords.length">—</span>
              </a-space>
            </ReadonlyField>
          </FormGrid>
        </FormSection>

        <FormSection :title="t('projects.sections.planContract')">
          <FormGrid :columns="4">
            <ReadonlyField :label="t('projects.columns.currentStage')">
              <a-tag :color="PROJECT_STAGE_COLORS[project.currentStage]">
                {{ localizeProjectStage(project.currentStage, 'zh-CN') }}
              </a-tag>
            </ReadonlyField>
            <ReadonlyField :label="t('projects.columns.progress')" :value="`${project.progressPercent ?? 0}%`" />
            <ReadonlyField :label="t('projects.columns.signedAt')" :value="date(project.contractSignedAt)" />
            <ReadonlyField :label="t('projects.detailPage.expectedAcceptanceLabel')" :value="date(project.expectedAcceptanceAt)" />
            <ReadonlyField :label="t('projects.detailPage.actualAcceptanceLabel')" :value="date(project.actualAcceptanceAt)" />
            <ReadonlyField :label="t('projects.createForm.sourceCurrency')" :value="project.contractCurrency" />
            <ReadonlyField :label="t('projects.columns.contractAmount')" :value="project.contractCurrency && project.contractAmount != null ? `${project.contractCurrency} ${money(project.contractAmount)}` : '—'" />
            <ReadonlyField :label="t('projects.columns.convertedCny')" :value="project.convertedAmount == null ? '—' : `CNY ${money(project.convertedAmount)}`" />
          </FormGrid>
        </FormSection>

        <FormSection :title="t('projects.createForm.team')">
          <FormGrid :columns="4">
            <ReadonlyField :label="t('projects.createForm.salesOwner')" :value="member('SALES_OWNER')" /><ReadonlyField :label="t('projects.createForm.manager')" :value="member('PROJECT_MANAGER')" /><ReadonlyField :label="t('projects.createForm.electricalOwner')" :value="member('ELEC_LEADER')" /><ReadonlyField :label="t('projects.createForm.softwareOwner')" :value="member('SOFTWARE_LEADER')" />
          </FormGrid>
        </FormSection>

        <FormSection :title="t('projects.sections.riskArchive')">
          <FormGrid :columns="4">
            <ReadonlyField :label="t('projects.detailPage.riskLevel')">
              <StatusBadge domain="risk" :status="project.riskLevel" :label="localizeProjectRisk(project.riskLevel, 'zh-CN')" />
            </ReadonlyField>
            <ReadonlyField class="span-2" :label="t('projects.detailPage.riskDescription')" :value="project.riskDescription" />
            <ReadonlyField :label="t('projects.detailPage.archiveCompletion')" :value="project.archiveCompletion ? `${project.archiveCompletion.completed}/${project.archiveCompletion.total} (${t('projects.detailPage.required')} ${project.archiveCompletion.requiredCompleted}/${project.archiveCompletion.requiredTotal})` : '—'" />
          </FormGrid>
        </FormSection>

        <FormSection :title="t('projects.detailPage.recentActivities')">
          <a-timeline v-if="project.recentActivities?.length">
            <a-timeline-item v-for="item in project.recentActivities" :key="item.id" :label="item.recordDate.slice(0, 16).replace('T', ' ')">
              <strong>{{ item.title }}</strong><p>{{ item.description || '—' }}</p>
            </a-timeline-item>
          </a-timeline><a-empty v-else :description="t('projects.detailPage.emptyActivities')" />
        </FormSection>

        <section v-if="project.canArchive && !project.archivedAt" class="archive-zone">
          <div><strong>{{ t('projects.archiveTitle') }}</strong><p>{{ t('projects.archiveHint') }}</p></div><a-button status="warning" @click="archiveProject">
            {{ t('projects.archiveTitle') }}
          </a-button>
        </section>
      </template>
    </a-spin>

    <BusinessModal
      v-model:visible="progressVisible"
      :title="t('projects.progress.update')"
      :width="620"
      :ok-loading="mutation.isPending.value"
      :on-before-ok="saveProgress"
    >
      <a-form :model="progressForm" layout="vertical">
        <FormGrid>
          <ReadonlyField :label="t('projects.progress.currentStage')" :value="project ? localizeProjectStage(project.currentStage, 'zh-CN') : '—'" />
          <a-form-item :label="t('projects.progress.newStage')" required>
            <a-select v-model="progressForm.targetStage">
              <a-option
                v-for="item in STAGE_OPTIONS"
                :key="item.value"
                :value="item.value"
                :label="item.label"
              />
            </a-select>
          </a-form-item>
          <a-form-item :label="t('projects.progress.percent')" required>
            <a-input-number v-model="progressForm.progressPercent" :min="0" :max="100" />
          </a-form-item>
          <a-form-item :label="t('projects.detailPage.expectedAcceptanceLabel')">
            <a-date-picker v-model="progressForm.expectedAcceptanceAt" format="YYYY-MM-DD" />
          </a-form-item>
          <a-form-item :label="t('projects.detailPage.actualAcceptanceLabel')">
            <a-date-picker v-model="progressForm.actualAcceptanceAt" format="YYYY-MM-DD" />
          </a-form-item>
          <a-form-item class="span-full" :label="t('projects.progress.reason')">
            <a-textarea v-model="progressForm.reason" :auto-size="{ minRows: 3, maxRows: 6 }" :placeholder="t('projects.progress.rollbackRequired')" />
          </a-form-item>
        </FormGrid>
      </a-form>
    </BusinessModal>
  </div>
</template>

<style scoped>
.detail-root { min-width: 0; }.archive-zone { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 18px; padding: 16px; border: 1px solid rgb(var(--warning-3)); background: var(--color-warning-light-1); }.archive-zone p, .arco-timeline p { margin: 4px 0 0; color: var(--color-text-3); }
</style>
