<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconClose } from '@arco-design/web-vue/es/icon'
import { useI18n } from 'vue-i18n'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { projectApi } from '@/api/project'
import { BusinessModal, FormGrid, FormSection, ReadonlyField, StatusBadge } from '@/components/business'
import { useProjectConfigurationQuery, useProjectDetailQuery } from '@/composables/queries/useProjectQueries'
import { queryKeys } from '@/query/keys'
import type { ProjectDeliveryStage } from '@/types/project'
import { PROJECT_DELIVERY_STAGES, STAGE_OPTIONS } from '@/types/project'
import { arcoConfirm } from '@/utils/arco-dialog'
import { PROJECT_STAGE_COLORS, projectDictionaryColor, type ProjectDictionaryKind } from '@/utils/project-dictionaries'
import { localizeProjectRisk, localizeProjectStage, localizeProjectStatus } from '@/utils/project-localization'

const props = defineProps<{ embedded?: boolean; projectId: string }>()
const emit = defineEmits<{ edit: []; close: []; changed: [] }>()
const queryClient = useQueryClient()
const { t } = useI18n()
const query = useProjectDetailQuery(() => props.projectId)
const configurationQuery = useProjectConfigurationQuery()
const project = computed(() => query.data.value)
const progressVisible = ref(false)
const progressForm = reactive({
  targetStage: 'STARTUP' as ProjectDeliveryStage, progressPercent: 0,
  expectedAcceptanceAt: '', actualAcceptanceAt: '', reason: '',
})
const mutation = useMutation({
  mutationFn: () => {
    if (!project.value) throw new Error(t('projects.detailPage.notLoaded'))
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
    Message.warning(t('projects.rollbackRequired'))
    return false
  }
  await mutation.mutateAsync()
  progressVisible.value = false
  Message.success(t('projects.progress.updated'))
  emit('changed')
  return true
}
async function archiveProject(): Promise<void> {
  if (!project.value) return
  await arcoConfirm(t('projects.archiveConfirm', { name: project.value.shortName || project.value.projectName }), t('projects.archiveTitle'), { type: 'warning' })
  await arcoConfirm(t('projects.archiveHint'), t('projects.archiveTitle'), { type: 'warning', confirmButtonText: t('projects.archive') })
  const updated = await projectApi.changeStatus(project.value.id, 'archive', { revision: project.value.revision })
  queryClient.setQueryData(queryKeys.projects.detail(props.projectId), updated)
  await queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() })
  Message.success(t('projects.archivedSuccess'))
  emit('changed')
  emit('close')
}
function date(value?: string | null): string { return value ? value.slice(0, 10) : '—' }
function money(value?: number | null): string { return value == null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value) }
function member(role: string): string { return project.value?.members?.find((item) => item.projectRole === role)?.user?.realName || '—' }
function configuredOption(key: 'projectTypes' | 'contractTypes' | 'productTypes' | 'projectKeywords', value?: string | null) {
  return configurationQuery.data.value?.[key].find((item) => item.value === value)
}
function configuredColor(kind: ProjectDictionaryKind, value: string): string {
  return projectDictionaryColor(kind, value)
}
</script>

<template>
  <div class="detail-root">
    <header class="detail-header">
      <h2>{{ t('projects.detail') }}</h2>
      <div class="detail-actions">
        <a-button v-if="project?.canEdit && !project.archivedAt" type="primary" @click="emit('edit')">
          {{ t('projects.edit') }}
        </a-button>
        <a-button v-if="project?.canUpdateProgress && !project.archivedAt" @click="openProgress">
          {{ t('projects.progress.update') }}
        </a-button>
        <a-button
          v-if="project?.canArchive && !project.archivedAt"
          status="warning"
          @click="archiveProject"
        >
          {{ t('projects.archiveTitle') }}
        </a-button>
        <button
          type="button"
          class="close-button"
          :aria-label="t('common.close')"
          @click="emit('close')"
        >
          <IconClose />
        </button>
      </div>
    </header>

    <div class="detail-body">
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
            <FormGrid :columns="3">
              <ReadonlyField :label="t('projects.detailPage.projectCode')" :value="project.projectCode" />
              <ReadonlyField :label="t('projects.createForm.projectName')" :value="project.projectName" />
              <ReadonlyField :label="t('projects.detailPage.shortName')" :value="project.shortName" />
              <ReadonlyField :label="t('projects.detailPage.customer')" :value="project.customerName" />
              <ReadonlyField :label="t('projects.detailPage.region')" :value="`${project.countryName || project.countryCode} · ${project.city || '—'}`" />
              <ReadonlyField :label="t('common.status')">
                <StatusBadge domain="project" :status="project.archivedAt ? 'ARCHIVED' : project.status" :label="project.archivedAt ? t('projects.archived') : localizeProjectStatus(project.status, 'zh-CN')" />
              </ReadonlyField>
              <ReadonlyField :label="t('projects.createForm.projectType')">
                <a-tag v-if="project.projectType" :color="configuredColor('projectType', project.projectType)">
                  {{ configuredOption('projectTypes', project.projectType)?.label || project.projectType }}
                </a-tag>
              </ReadonlyField>
              <ReadonlyField :label="t('projects.createForm.contractType')">
                <a-tag v-if="project.contractType" :color="configuredColor('contractType', project.contractType)">
                  {{ configuredOption('contractTypes', project.contractType)?.label || project.contractType }}
                </a-tag>
              </ReadonlyField>
              <ReadonlyField :label="t('projects.createForm.product')">
                <a-tag v-if="project.product" :color="configuredColor('productType', project.product)">
                  {{ configuredOption('productTypes', project.product)?.label || project.product }}
                </a-tag>
              </ReadonlyField>
              <ReadonlyField class="span-full" :label="t('projects.createForm.keywords')">
                <a-space wrap>
                  <a-tag v-for="item in project.keywords" :key="item" :color="configuredColor('projectKeyword', item)">
                    {{ configuredOption('projectKeywords', item)?.label || item }}
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
              <ReadonlyField :label="t('projects.createForm.salesOwner')" :value="member('SALES_OWNER')" />
              <ReadonlyField :label="t('projects.createForm.manager')" :value="member('PROJECT_MANAGER')" />
              <ReadonlyField :label="t('projects.createForm.electricalOwner')" :value="member('ELEC_LEADER')" />
              <ReadonlyField :label="t('projects.createForm.softwareOwner')" :value="member('SOFTWARE_LEADER')" />
            </FormGrid>
          </FormSection>

          <FormSection :title="t('projects.sections.riskArchive')">
            <FormGrid :columns="3">
              <ReadonlyField :label="t('projects.detailPage.riskLevel')">
                <StatusBadge domain="risk" :status="project.riskLevel" :label="localizeProjectRisk(project.riskLevel, 'zh-CN')" />
              </ReadonlyField>
              <ReadonlyField :label="t('projects.detailPage.riskDescription')" :value="project.riskDescription" />
              <ReadonlyField :label="t('projects.detailPage.archiveCompletion')">
                <span v-if="project.archiveCompletion">
                  {{ project.archiveCompletion.completed }}/{{ project.archiveCompletion.total }}
                  <small class="required-progress">
                    ({{ t('projects.detailPage.required') }}
                    {{ project.archiveCompletion.requiredCompleted }}/{{ project.archiveCompletion.requiredTotal }})
                  </small>
                </span>
                <span v-else>—</span>
              </ReadonlyField>
            </FormGrid>
          </FormSection>
        </template>
      </a-spin>
    </div>

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
.detail-root {
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-2);
  color: var(--color-text-1);
}

.detail-header {
  min-height: 64px;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--color-border-2);
}

.detail-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  line-height: 1.4;
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-actions :deep(.arco-btn) {
  border-radius: 2px;
}

.detail-actions :deep(.arco-btn-secondary) {
  background: transparent;
}

.detail-actions :deep(.arco-btn-status-warning) {
  border-color: rgb(var(--orange-3));
  color: rgb(var(--orange-6));
}

.close-button {
  width: 32px;
  height: 32px;
  min-width: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text-3);
  cursor: pointer;
}

.close-button:hover {
  color: var(--color-text-1);
}

.detail-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 24px;
  scrollbar-width: thin;
  scrollbar-color: var(--color-fill-4) transparent;
}

.detail-body :deep(.arco-spin) {
  width: 100%;
}

.detail-body :deep(.form-section) {
  padding: 22px 0;
}

.detail-body :deep(.form-section__header) {
  margin-bottom: 8px;
}

.detail-body :deep(.form-section__header h3) {
  font-size: 15px;
  font-weight: 500;
}

.detail-body :deep(.readonly-field) {
  padding: 8px 0;
}

.detail-body :deep(.arco-tag) {
  border-radius: 2px;
}

.required-progress {
  margin-left: 4px;
  color: rgb(var(--danger-6));
  font-size: 12px;
  font-weight: 400;
}

@media (max-width: 720px) {
  .detail-header {
    align-items: flex-start;
    padding: 12px 16px;
  }

  .detail-actions {
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .detail-body {
    padding: 0 16px 16px;
  }
}
</style>
