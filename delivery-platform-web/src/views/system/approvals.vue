<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'

import { approvalTemplateApi, type QueryApprovalTemplateParams } from '@/api/approval'
import {
  BusinessModal,
  BusinessTable,
  Can,
  PageContainer,
  PageToolbar,
  SectionCard,
  StatusBadge,
} from '@/components/business'
import { usePermission } from '@/composables/usePermission'
import { useApprovalTemplatesQuery } from '@/composables/queries/useOperationsQueries'
import { queryKeys } from '@/query/keys'
import type {
  ApprovalApproverType,
  ApprovalBusinessType,
  ApprovalStepMode,
  ApprovalTemplate,
  ApprovalTemplateStep,
  SaveApprovalTemplateDto,
} from '@/types/settings'
import { arcoConfirm } from '@/utils/arco-dialog'

interface ApprovalEditorForm {
  templateCode: string
  templateName: string
  businessType: ApprovalBusinessType
  countryCode: string
  enabled: boolean
  steps: ApprovalTemplateStep[]
}

const { hasPermission } = usePermission()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const { t } = useI18n()
const canManage = computed(() => hasPermission('approval_config:manage'))

const query = reactive<QueryApprovalTemplateParams>({
  page: Number(route.query.page) || 1,
  pageSize: Number(route.query.pageSize) || 20,
  keyword: typeof route.query.keyword === 'string' ? route.query.keyword : '',
})
const appliedQuery = ref({ ...query })
const templatesQuery = useApprovalTemplatesQuery(appliedQuery)
const templates = computed(() => templatesQuery.data.value?.items ?? [])
const total = computed(() => templatesQuery.data.value?.total ?? 0)
const pagination = computed(() => ({
  page: query.page,
  pageSize: query.pageSize,
  total: total.value,
}))
const loading = computed(() => templatesQuery.isFetching.value)
const loadFailed = computed(() => templatesQuery.isError.value)

const editorVisible = ref(false)
const editingId = ref('')
const form = reactive<ApprovalEditorForm>({
  templateCode: '',
  templateName: '',
  businessType: 'PROJECT_ARCHIVE_FILE',
  countryCode: '',
  enabled: true,
  steps: [],
})

const businessOptions = computed<Array<{ value: ApprovalBusinessType; label: string }>>(() =>
  (
    ['PROJECT_CREATE', 'PROJECT_ARCHIVE_FILE', 'STANDARD', 'KNOWLEDGE', 'ARCHIVE_TEMPLATE'] as const
  ).map((value) => ({ value, label: t(`approvals.businessTypes.${value}`) })),
)

const approverOptions = computed<Array<{ value: ApprovalApproverType; label: string }>>(() =>
  (['role', 'user'] as const).map((value) => ({
    value,
    label: t(`approvals.approverTypes.${value}`),
  })),
)

const modeOptions = computed<Array<{ value: ApprovalStepMode; label: string }>>(() =>
  (['SINGLE', 'ALL_SIGN', 'ANY_N', 'PARALLEL'] as const).map((value) => ({
    value,
    label: t(`approvals.stepModes.${value}`),
  })),
)

const columns = computed<TableColumnData[]>(() => [
  { title: t('approvals.flowName'), dataIndex: 'templateName', minWidth: 190, fixed: 'left' },
  { title: t('approvals.flowCode'), dataIndex: 'templateCode', minWidth: 170 },
  {
    title: t('approvals.businessType'),
    dataIndex: 'businessType',
    slotName: 'businessType',
    width: 140,
  },
  { title: t('approvals.country'), dataIndex: 'countryCode', slotName: 'country', width: 110 },
  { title: t('approvals.steps'), slotName: 'steps', minWidth: 300 },
  { title: t('approvals.enabled'), dataIndex: 'enabled', slotName: 'enabled', width: 150 },
  { title: t('common.action'), slotName: 'actions', width: 160, fixed: 'right' },
])

type ApprovalMutationVariables =
  | { kind: 'save'; id?: string; data: SaveApprovalTemplateDto }
  | { kind: 'toggle'; id: string }
  | { kind: 'delete'; id: string }

const approvalMutation = useMutation({
  mutationFn: async (variables: ApprovalMutationVariables) => {
    switch (variables.kind) {
      case 'save':
        if (variables.id) await approvalTemplateApi.update(variables.id, variables.data)
        else await approvalTemplateApi.create(variables.data)
        return
      case 'toggle':
        await approvalTemplateApi.toggle(variables.id)
        return
      case 'delete':
        await approvalTemplateApi.delete(variables.id)
    }
  },
  retry: false,
  onSuccess: () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.settings.approvalTemplateLists(),
    }),
})
const saving = computed(() => approvalMutation.isPending.value)

function newStep(order: number): ApprovalTemplateStep {
  return {
    stepOrder: order,
    stepName: order === 1 ? t('approvals.defaultFirstStep') : t('approvals.defaultStep', { order }),
    mode: 'SINGLE',
    requiredCount: 1,
    approverType: 'role',
    approverValues: [],
  }
}

async function fetchTemplates(): Promise<void> {
  await templatesQuery.refetch()
}

async function applyQuery(): Promise<void> {
  appliedQuery.value = {
    page: query.page,
    pageSize: query.pageSize,
    keyword: query.keyword?.trim() || '',
  }
  await router.replace({
    path: route.path,
    query: {
      page: query.page === 1 ? undefined : String(query.page),
      pageSize: query.pageSize === 20 ? undefined : String(query.pageSize),
      keyword: query.keyword?.trim() || undefined,
    },
  })
}

function resetForm(): void {
  Object.assign(form, {
    templateCode: '',
    templateName: '',
    businessType: 'PROJECT_ARCHIVE_FILE' as const,
    countryCode: '',
    enabled: true,
    steps: [newStep(1)],
  })
}

function openCreate(): void {
  if (!canManage.value) return
  editingId.value = ''
  resetForm()
  editorVisible.value = true
}

function openEdit(template: ApprovalTemplate): void {
  if (!canManage.value) return
  editingId.value = template.id
  Object.assign(form, {
    templateCode: template.templateCode,
    templateName: template.templateName,
    businessType: template.businessType,
    countryCode: template.countryCode ?? '',
    enabled: template.enabled,
    steps: template.steps.length
      ? template.steps.map((step, index) => ({ ...step, stepOrder: index + 1 }))
      : [newStep(1)],
  })
  editorVisible.value = true
}

function addStep(): void {
  form.steps.push(newStep(form.steps.length + 1))
}

function removeStep(index: number): void {
  if (form.steps.length === 1) {
    Message.warning(t('approvals.validation.stepRequired'))
    return
  }
  form.steps.splice(index, 1)
  form.steps.forEach((step, stepIndex) => {
    step.stepOrder = stepIndex + 1
  })
}

function validateForm(): boolean {
  if (!form.templateCode.trim() || !form.templateName.trim()) {
    Message.warning(t('approvals.validation.basic'))
    return false
  }
  if (!form.steps.length) {
    Message.warning(t('approvals.validation.stepRequired'))
    return false
  }
  if (form.steps.some((step) => !step.stepName.trim() || !step.approverValues.length)) {
    Message.warning(t('approvals.validation.stepComplete'))
    return false
  }
  if (
    form.steps.some(
      (step) =>
        (step.mode === 'SINGLE' && step.approverValues.length !== 1) ||
        (step.mode === 'ANY_N' &&
          (!step.requiredCount || step.requiredCount > step.approverValues.length)),
    )
  ) {
    Message.warning(t('approvals.validation.modeInvalid'))
    return false
  }
  return true
}

async function saveTemplate(): Promise<void> {
  if (!canManage.value || !validateForm()) return
  const payload: SaveApprovalTemplateDto = {
    templateCode: form.templateCode.trim(),
    templateName: form.templateName.trim(),
    businessType: form.businessType,
    countryCode: form.countryCode.trim() || undefined,
    enabled: form.enabled,
    steps: form.steps.map((step, index) => ({
      stepOrder: index + 1,
      stepName: step.stepName.trim(),
      mode: step.mode,
      requiredCount: step.mode === 'ANY_N' ? step.requiredCount : undefined,
      approverType: step.approverType,
      approverValues: step.approverValues.map((value) => value.trim()).filter(Boolean),
    })),
  }

  try {
    await approvalMutation.mutateAsync({
      kind: 'save',
      id: editingId.value || undefined,
      data: payload,
    })
    if (editingId.value) {
      Message.success(t('approvals.updated'))
    } else {
      Message.success(t('approvals.created'))
    }
    editorVisible.value = false
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

async function toggleTemplate(template: ApprovalTemplate): Promise<void> {
  if (!canManage.value) return
  try {
    await approvalMutation.mutateAsync({ kind: 'toggle', id: template.id })
    Message.success(template.enabled ? t('approvals.disabled') : t('approvals.enabledMessage'))
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

function deleteTemplate(template: ApprovalTemplate): void {
  if (!canManage.value) return
  arcoConfirm(
    t('approvals.deleteConfirm', { name: template.templateName }),
    t('approvals.deleteTitle'),
    {
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    },
  )
    .then(async () => {
      await approvalMutation.mutateAsync({ kind: 'delete', id: template.id })
      Message.success(t('approvals.deleted'))
    })
    .catch(() => undefined)
}

function search(): void {
  query.page = 1
  void applyQuery()
}

function resetSearch(): void {
  query.keyword = ''
  query.page = 1
  void applyQuery()
}

function changePage(page: number): void {
  query.page = page
  void applyQuery()
}

function businessLabel(type: ApprovalBusinessType): string {
  return businessOptions.value.find((option) => option.value === type)?.label ?? type
}

function approverLabel(type: ApprovalApproverType): string {
  return approverOptions.value.find((option) => option.value === type)?.label ?? type
}

function modeLabel(mode: ApprovalStepMode): string {
  return modeOptions.value.find((option) => option.value === mode)?.label ?? mode
}

function handleModeChange(step: ApprovalTemplateStep): void {
  if (step.mode === 'SINGLE' && step.approverValues.length > 1) {
    step.approverValues = step.approverValues.slice(0, 1)
  }
  step.requiredCount =
    step.mode === 'ANY_N'
      ? Math.min(Math.max(step.requiredCount ?? 1, 1), Math.max(step.approverValues.length, 1))
      : step.mode === 'SINGLE'
        ? 1
        : step.approverValues.length
}

resetForm()
</script>

<template>
  <PageContainer class="approval-page">
    <PageToolbar :title="t('approvals.title')" :description="t('approvals.description')">
      <template #actions>
        <Can permission="approval_config:manage">
          <a-button type="primary" @click="openCreate">
            {{ t('approvals.create') }}
          </a-button>
        </Can>
      </template>
    </PageToolbar>

    <a-alert
      v-if="!canManage"
      class="page-alert"
      type="info"
      :title="t('approvals.readOnly')"
    >
      {{ t('approvals.readOnlyHint') }}
    </a-alert>
    <SectionCard class="filter-card" :bordered="false">
      <a-form :model="query" layout="inline" @submit-success="search">
        <a-form-item :label="t('approvals.flowName')">
          <a-input
            v-model="query.keyword"
            class="keyword-input"
            allow-clear
            :placeholder="t('approvals.searchPlaceholder')"
            @press-enter="search"
          />
        </a-form-item>
        <a-form-item>
          <a-space>
            <a-button type="primary" @click="search">
              {{ t('review.query') }}
            </a-button>
            <a-button @click="resetSearch">
              {{ t('common.reset') }}
            </a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </SectionCard>

    <BusinessTable
      :loading="loading"
      :columns="columns"
      :data="templates"
      :pagination="pagination"
      :scroll="{ x: 1200 }"
      :error="loadFailed ? t('approvals.loadFailed') : null"
      :empty-title="t('approvals.empty')"
      :empty-description="t('approvals.unavailable')"
      :retry-label="t('common.retry')"
      row-key="id"
      class="settings-table"
      @retry="fetchTemplates"
      @page-change="changePage"
    >
      <template #businessType="{ record }">
        <a-tag>{{ businessLabel(record.businessType) }}</a-tag>
      </template>
      <template #country="{ record }">
        {{
          record.countryCode || t('approvals.allCountries')
        }}
      </template>
      <template #steps="{ record }">
        <a-space size="mini" wrap>
          <a-tag v-for="step in record.steps" :key="`${record.id}-${step.stepOrder}`">
            {{ step.stepOrder }}. {{ step.stepName }}（{{ modeLabel(step.mode) }} ·
            {{ approverLabel(step.approverType) }} · {{ step.approverValues.length }}）
          </a-tag>
        </a-space>
      </template>
      <template #enabled="{ record }">
        <a-space size="mini">
          <StatusBadge
            domain="approval"
            :status="record.enabled ? 'ENABLED' : 'DISABLED'"
            :label="record.enabled ? t('approvals.enabled') : t('approvals.disabledStatus')"
          />
          <Can permission="approval_config:manage">
            <a-switch :model-value="record.enabled" @change="toggleTemplate(record)" />
          </Can>
        </a-space>
      </template>
      <template #actions="{ record }">
        <Can permission="approval_config:manage">
          <a-space size="mini" :wrap="false">
            <a-button type="text" size="small" @click="openEdit(record)">
              {{ t('common.edit') }}
            </a-button>
            <a-button
              type="text"
              size="small"
              status="danger"
              @click="deleteTemplate(record)"
            >
              {{ t('common.delete') }}
            </a-button>
          </a-space>
        </Can>
      </template>
    </BusinessTable>

    <BusinessModal
      v-model:visible="editorVisible"
      :title="editingId ? t('approvals.editTitle') : t('approvals.createTitle')"
      :width="820"
      :ok-loading="saving"
      :ok-text="t('common.save')"
      :cancel-text="t('common.cancel')"
      @ok="saveTemplate"
    >
      <a-form :model="form" layout="vertical">
        <div class="form-grid">
          <a-form-item :label="t('approvals.flowCode')" required>
            <a-input
              v-model="form.templateCode"
              :max-length="100"
              :placeholder="t('approvals.codePlaceholder')"
            />
          </a-form-item>
          <a-form-item :label="t('approvals.flowName')" required>
            <a-input
              v-model="form.templateName"
              :max-length="100"
              :placeholder="t('approvals.namePlaceholder')"
            />
          </a-form-item>
          <a-form-item :label="t('approvals.businessType')" required>
            <a-select v-model="form.businessType">
              <a-option v-for="option in businessOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item :label="t('approvals.country')">
            <a-input
              v-model="form.countryCode"
              allow-clear
              :placeholder="t('approvals.countryPlaceholder')"
            />
          </a-form-item>
        </div>

        <a-form-item :label="t('approvals.steps')" required>
          <div class="steps-editor">
            <div v-for="(step, index) in form.steps" :key="index" class="step-row">
              <span class="step-order">{{ index + 1 }}</span>
              <a-input
                v-model="step.stepName"
                :placeholder="t('approvals.stepName')"
                :max-length="100"
              />
              <a-select v-model="step.approverType">
                <a-option
                  v-for="option in approverOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </a-option>
              </a-select>
              <a-select v-model="step.mode" @change="handleModeChange(step)">
                <a-option v-for="option in modeOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </a-option>
              </a-select>
              <a-select
                v-model="step.approverValues"
                multiple
                allow-create
                allow-clear
                :placeholder="
                  step.approverType === 'role'
                    ? t('approvals.roleCodes')
                    : t('approvals.userIds')
                "
                @change="handleModeChange(step)"
              />
              <a-input-number
                v-if="step.mode === 'ANY_N'"
                v-model="step.requiredCount"
                :min="1"
                :max="Math.max(step.approverValues.length, 1)"
                :placeholder="t('approvals.requiredCount')"
              />
              <span v-else class="required-count-placeholder">
                {{ t('approvals.requiredCountAuto') }}
              </span>
              <a-button type="text" status="danger" @click="removeStep(index)">
                {{ t('common.delete') }}
              </a-button>
            </div>
            <a-button class="add-step-button" @click="addStep">
              {{
                t('approvals.addStep')
              }}
            </a-button>
          </div>
        </a-form-item>
        <a-form-item :label="t('approvals.enableTemplate')">
          <a-switch v-model="form.enabled" />
        </a-form-item>
      </a-form>
    </BusinessModal>
  </PageContainer>
</template>

<style scoped lang="scss">
.approval-page {
  min-width: 0;
}

.page-alert,
.filter-card {
  margin-bottom: 12px;
}

.keyword-input {
  width: 300px;
}

.settings-table {
  background: var(--color-bg-2);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.steps-editor {
  width: 100%;
  display: grid;
  gap: 8px;
}

.step-row {
  display: grid;
  grid-template-columns:
    28px minmax(130px, 1fr) 90px 110px minmax(190px, 1.2fr) minmax(100px, 0.6fr)
    auto;
  align-items: center;
  gap: 8px;
}

.required-count-placeholder {
  color: var(--color-text-3);
  font-size: 12px;
}

.step-order {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: rgb(var(--primary-6));
  background: rgb(var(--primary-1));
  font-size: 12px;
  line-height: 24px;
  text-align: center;
}

.add-step-button {
  justify-self: start;
}

@media (max-width: 760px) {
  .form-grid,
  .step-row {
    grid-template-columns: 1fr;
  }

  .step-order {
    display: none;
  }

  .keyword-input {
    width: 100%;
  }
}
</style>
