<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Message } from '@arco-design/web-vue'
import type { FormInstance } from '@arco-design/web-vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { projectApi } from '@/api/project'
import { hasHttpStatus } from '@/api/errors'
import { PageContainer, SectionCard, StickyActionBar } from '@/components/business'
import {
  useProjectDetailQuery,
  useProjectFormOptionsQueries,
} from '@/composables/queries/useProjectQueries'
import { usePermission } from '@/composables/usePermission'
import { queryKeys } from '@/query/keys'
import type { ArchiveTemplate } from '@/types/archive'
import type { Country } from '@/types/country'
import type { Currency } from '@/types/currency'
import type { Language } from '@/types/language'
import type {
  CreateProjectDto,
  ProjectDeliveryStage,
  ProjectUserReferenceOption,
  UpdateProjectDto,
} from '@/types/project'
import { RISK_LEVEL_OPTIONS, STAGE_OPTIONS } from '@/types/project'

const props = withDefaults(
  defineProps<{
    embedded?: boolean
    projectId?: string
  }>(),
  {
    embedded: false,
    projectId: '',
  },
)

const emit = defineEmits<{
  saved: []
  cancel: []
}>()

const route = useRoute()
const router = useRouter()
const { hasAnyPermission } = usePermission()
const queryClient = useQueryClient()
const { t } = useI18n()
const resolvedProjectId = computed(
  () =>
    props.projectId ||
    String(route.params.projectId || route.params.id || route.query.projectId || ''),
)
const isEdit = computed(() => Boolean(resolvedProjectId.value))
const canEditFinancial = computed(() => hasAnyPermission(['project:view_financial']))
const canEditContract = computed(() => hasAnyPermission(['project:view_contract']))
const canEditAcceptance = computed(() => hasAnyPermission(['project:view_acceptance']))
const formRef = ref<FormInstance>()

const formData = reactive({
  projectName: '',
  shortName: '',
  countryCode: 'CN',
  city: '',
  customerName: '',
  projectType: '',
  projectLanguage: 'zh-CN',
  contractNo: '',
  contractCurrency: 'CNY',
  baseCurrency: 'CNY',
  contractAmount: undefined as number | undefined,
  contractSignedAt: '',
  startDate: '',
  plannedEndDate: '',
  expectedAcceptanceAt: '',
  deliveryStage: 'STARTUP' as ProjectDeliveryStage,
  progressPercent: undefined as number | undefined,
  riskLevel: 'Low',
  riskDescription: '',
  salesOwnerId: '',
  projectManagerId: '',
  electricLeaderId: '',
  softwareLeaderId: '',
  purchaseOwnerId: '',
  financeOwnerId: '',
  archiveTemplateId: '',
})

function createDraftIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `project-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
  )
}

const createIdempotencyKey = ref(createDraftIdempotencyKey())

const rules = computed(() => ({
  projectName: [
    { required: true, message: t('projects.createForm.validationName'), trigger: 'blur' },
  ],
  countryCode: [
    { required: true, message: t('projects.createForm.validationCountry'), trigger: 'change' },
  ],
  archiveTemplateId: [
    {
      required: !isEdit.value,
      message: t('projects.createForm.validationArchiveTemplate'),
      trigger: 'change',
    },
  ],
}))

const optionQueries = useProjectFormOptionsQueries(computed(() => !isEdit.value))
const projectQuery = useProjectDetailQuery(resolvedProjectId)

const countryOptions = computed(() =>
  (optionQueries.value[0].data?.items ?? []).map((country: Country) => ({
    value: country.countryCode,
    label: `${country.nameZh} (${country.countryCode})`,
  })),
)
const currencyOptions = computed(() =>
  (optionQueries.value[1].data ?? []).map((currency: Currency) => ({
    value: currency.currencyCode,
    label: `${currency.currencyName} (${currency.currencySymbol || currency.currencyCode})`,
  })),
)
const languageOptions = computed(() =>
  (optionQueries.value[2].data ?? [])
    .filter((language: Language) => language.status === 'Active')
    .map((language: Language) => ({
      value: language.languageCode,
      label: language.languageName,
    })),
)
const projectTypeOptions = computed(() =>
  (optionQueries.value[3].data?.items ?? []).map((item) => ({
    value: item.itemValue,
    label: item.itemLabel,
  })),
)
const salesOwnerOptions = computed<ProjectUserReferenceOption[]>(
  () => optionQueries.value[4].data ?? [],
)
const projectManagerOptions = computed<ProjectUserReferenceOption[]>(
  () => optionQueries.value[5].data ?? [],
)
const memberOptions = computed<ProjectUserReferenceOption[]>(
  () => optionQueries.value[6].data ?? [],
)
const archiveTemplateOptions = computed(() =>
  ((optionQueries.value[7].data ?? []) as ArchiveTemplate[])
    .filter(
      (template) =>
        template.status === 'PUBLISHED' && template.currentPublishedVersion?.status === 'PUBLISHED',
    )
    .map((template) => ({
      value: template.id,
      label: `${template.templateName} (${template.templateCode}) · ${template.currentPublishedVersion?.versionNo}`,
    })),
)
const optionLoading = computed(() => optionQueries.value.some((query) => query.isFetching))
const loadError = computed(
  () =>
    optionQueries.value.some((query) => query.isError) ||
    (isEdit.value && projectQuery.isError.value),
)

type SaveProjectVariables =
  | { kind: 'create'; data: CreateProjectDto; idempotencyKey: string }
  | { kind: 'update'; id: string; data: UpdateProjectDto }

const saveProjectMutation = useMutation({
  mutationFn: (variables: SaveProjectVariables) =>
    variables.kind === 'update'
      ? projectApi.update(variables.id, variables.data)
      : projectApi.create(variables.data, variables.idempotencyKey),
  retry: false,
  onSuccess: async (project, variables) => {
    const projectId = variables.kind === 'update' ? variables.id : project.id
    queryClient.setQueryData(queryKeys.projects.detail(projectId), project)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.summary() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) }),
    ])
  },
})
const loading = computed(() => saveProjectMutation.isPending.value)

function referenceLabel(option: ProjectUserReferenceOption): string {
  const department = option.departmentName ? ` · ${option.departmentName}` : ''
  return `${option.displayName} (${option.name})${department}`
}

async function loadOptions(): Promise<void> {
  await Promise.allSettled(optionQueries.value.map((query) => query.refetch()))
}

function hydrateProjectForm(project: NonNullable<typeof projectQuery.data.value>): void {
  Object.assign(formData, {
    projectName: project.projectName,
    shortName: project.shortName || '',
    countryCode: project.countryCode,
    city: project.city || '',
    customerName: project.customerName || '',
    projectType: project.projectType || '',
    projectLanguage: project.projectLanguage || 'zh-CN',
    contractNo: project.contractNo || '',
    contractCurrency: project.contractCurrency || 'CNY',
    baseCurrency: project.baseCurrency || 'CNY',
    contractAmount: project.contractAmount ?? undefined,
    contractSignedAt: project.contractSignedAt?.slice(0, 10) || '',
    startDate: project.startDate?.slice(0, 10) || '',
    plannedEndDate: project.plannedEndDate?.slice(0, 10) || '',
    expectedAcceptanceAt: project.expectedAcceptanceAt?.slice(0, 10) || '',
    deliveryStage: project.currentStage,
    progressPercent: project.progressPercent ?? undefined,
    riskLevel: project.riskLevel,
    riskDescription: project.riskDescription || '',
    salesOwnerId: project.salesOwnerId || '',
    projectManagerId: project.projectManagerId || '',
    electricLeaderId: project.electricLeaderId || '',
    softwareLeaderId: project.softwareLeaderId || '',
    purchaseOwnerId: project.purchaseOwnerId || '',
    financeOwnerId: project.financeOwnerId || '',
  })
}

watch(
  () => projectQuery.data.value,
  (project) => {
    if (project) hydrateProjectForm(project)
  },
  { immediate: true },
)

function buildCommonPayload(): Omit<UpdateProjectDto, 'revision'> {
  const payload: Omit<UpdateProjectDto, 'revision'> = {
    projectName: formData.projectName.trim(),
    shortName: formData.shortName.trim() || undefined,
    countryCode: formData.countryCode,
    city: formData.city.trim() || undefined,
    customerName: formData.customerName.trim() || undefined,
    projectType: formData.projectType || undefined,
    projectLanguage: formData.projectLanguage || undefined,
    startDate: formData.startDate || undefined,
    plannedEndDate: formData.plannedEndDate || undefined,
    progressPercent: formData.progressPercent,
    riskLevel: formData.riskLevel,
    riskDescription: formData.riskDescription.trim() || undefined,
    salesOwnerId: formData.salesOwnerId || undefined,
    projectManagerId: formData.projectManagerId || undefined,
    electricLeaderId: formData.electricLeaderId || undefined,
    softwareLeaderId: formData.softwareLeaderId || undefined,
    purchaseOwnerId: formData.purchaseOwnerId || undefined,
    financeOwnerId: formData.financeOwnerId || undefined,
  }
  if (canEditFinancial.value) {
    payload.contractCurrency = formData.contractCurrency || undefined
    payload.baseCurrency = formData.baseCurrency || undefined
    payload.contractAmount = formData.contractAmount
  }
  if (canEditContract.value) {
    payload.contractNo = formData.contractNo.trim() || undefined
    payload.contractSignedAt = formData.contractSignedAt || undefined
  }
  return payload
}

async function handleSubmit(): Promise<void> {
  if (!formRef.value) return
  const errors = await formRef.value.validate().catch((error: unknown) => error)
  if (errors) return

  try {
    const commonPayload = buildCommonPayload()
    if (isEdit.value) {
      const currentProject = projectQuery.data.value
      if (!currentProject) return
      await saveProjectMutation.mutateAsync({
        kind: 'update',
        id: resolvedProjectId.value,
        data: { ...commonPayload, revision: currentProject.revision },
      })
    } else {
      const createPayload: CreateProjectDto = {
        ...commonPayload,
        projectName: formData.projectName.trim(),
        countryCode: formData.countryCode,
        archiveTemplateId: formData.archiveTemplateId,
        deliveryStage: formData.deliveryStage,
        expectedAcceptanceAt: canEditAcceptance.value
          ? formData.expectedAcceptanceAt || undefined
          : undefined,
      }
      await saveProjectMutation.mutateAsync({
        kind: 'create',
        data: createPayload,
        idempotencyKey: createIdempotencyKey.value,
      })
      createIdempotencyKey.value = createDraftIdempotencyKey()
    }

    Message.success(
      isEdit.value ? t('projects.createForm.updated') : t('projects.createForm.created'),
    )
    if (props.embedded) emit('saved')
    else await router.push('/projects')
  } catch (error) {
    if (hasHttpStatus(error, 409)) {
      if (isEdit.value) {
        Message.warning(t('projects.conflict'))
        await projectQuery.refetch()
      } else {
        Message.warning(t('projects.createForm.conflict'))
      }
    }
  }
}

function handleCancel(): void {
  if (!isEdit.value) createIdempotencyKey.value = createDraftIdempotencyKey()
  if (props.embedded) emit('cancel')
  else void router.push('/projects')
}
</script>

<template>
  <PageContainer class="create-project-page" :class="{ embedded }">
    <SectionCard
      :bordered="false"
      class="project-form-card"
      :title="
        !embedded
          ? isEdit
            ? t('projects.createForm.editTitle')
            : t('projects.createForm.createTitle')
          : ''
      "
    >
      <a-alert v-if="loadError" type="warning" class="load-alert">
        {{ t('projects.createForm.optionsFailed') }}
        <template #action>
          <a-button size="small" @click="loadOptions">
            {{ t('common.retry') }}
          </a-button>
        </template>
      </a-alert>

      <a-spin :loading="optionLoading">
        <a-form
          ref="formRef"
          :model="formData"
          :rules="rules"
          layout="vertical"
          class="project-form"
        >
          <a-divider orientation="left">
            {{ t('projects.createForm.basic') }}
          </a-divider>
          <a-row :gutter="14">
            <a-col :span="16">
              <a-form-item :label="t('projects.createForm.projectName')" field="projectName">
                <a-input
                  v-model="formData.projectName"
                  :max-length="200"
                  show-word-limit
                  :placeholder="t('projects.createForm.projectNamePlaceholder')"
                />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item :label="t('projects.createForm.shortName')">
                <a-input
                  v-model="formData.shortName"
                  :max-length="100"
                  :placeholder="t('projects.createForm.shortNamePlaceholder')"
                />
              </a-form-item>
            </a-col>
          </a-row>
          <a-row v-if="!isEdit" :gutter="14">
            <a-col :span="24">
              <a-form-item
                :label="t('projects.createForm.archiveTemplate')"
                field="archiveTemplateId"
              >
                <a-select
                  v-model="formData.archiveTemplateId"
                  allow-search
                  :placeholder="t('projects.createForm.archiveTemplatePlaceholder')"
                >
                  <a-option
                    v-for="item in archiveTemplateOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="14">
            <a-col :span="8">
              <a-form-item :label="t('projects.createForm.country')" field="countryCode">
                <a-select
                  v-model="formData.countryCode"
                  allow-search
                  :placeholder="t('projects.createForm.countryPlaceholder')"
                >
                  <a-option
                    v-for="item in countryOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item :label="t('projects.createForm.city')">
                <a-input
                  v-model="formData.city"
                  :max-length="100"
                  :placeholder="t('projects.createForm.cityPlaceholder')"
                />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item :label="t('projects.createForm.customer')">
                <a-input
                  v-model="formData.customerName"
                  :max-length="200"
                  :placeholder="t('projects.createForm.customerPlaceholder')"
                />
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="14">
            <a-col :span="12">
              <a-form-item :label="t('projects.createForm.projectType')">
                <a-select
                  v-model="formData.projectType"
                  allow-search
                  allow-clear
                  :placeholder="t('projects.createForm.projectTypePlaceholder')"
                >
                  <a-option
                    v-for="item in projectTypeOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item :label="t('projects.createForm.language')">
                <a-select
                  v-model="formData.projectLanguage"
                  allow-search
                  allow-clear
                  :placeholder="t('projects.createForm.languagePlaceholder')"
                >
                  <a-option
                    v-for="item in languageOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>

          <template v-if="canEditContract || canEditFinancial">
            <a-divider orientation="left">
              {{ t('projects.createForm.contractSection') }}
            </a-divider>
          </template>
          <a-row v-if="canEditContract" :gutter="14">
            <a-col :span="12">
              <a-form-item :label="t('projects.createForm.contractNo')">
                <a-input
                  v-model="formData.contractNo"
                  :max-length="100"
                  :placeholder="t('projects.createForm.contractHiddenHint')"
                />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item :label="t('projects.createForm.signedAt')">
                <a-date-picker
                  v-model="formData.contractSignedAt"
                  format="YYYY-MM-DD"
                  style="width: 100%"
                />
              </a-form-item>
            </a-col>
          </a-row>
          <a-row v-if="canEditFinancial" :gutter="14">
            <a-col :span="8">
              <a-form-item :label="t('projects.createForm.sourceCurrency')">
                <a-select v-model="formData.contractCurrency" allow-search allow-clear>
                  <a-option
                    v-for="item in currencyOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item :label="t('projects.createForm.convertedCurrency')">
                <a-select v-model="formData.baseCurrency" allow-search allow-clear>
                  <a-option
                    v-for="item in currencyOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item :label="t('projects.createForm.contractAmount')">
                <a-input-number
                  v-model="formData.contractAmount"
                  :min="0"
                  :precision="2"
                  :placeholder="t('projects.createForm.amountPlaceholder')"
                  style="width: 100%"
                />
              </a-form-item>
            </a-col>
          </a-row>

          <a-divider orientation="left">
            {{ t('projects.createForm.planSection') }}
          </a-divider>
          <a-row :gutter="14">
            <a-col :span="8">
              <a-form-item :label="t('projects.createForm.plannedStart')">
                <a-date-picker
                  v-model="formData.startDate"
                  format="YYYY-MM-DD"
                  style="width: 100%"
                />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item :label="t('projects.createForm.plannedEnd')">
                <a-date-picker
                  v-model="formData.plannedEndDate"
                  format="YYYY-MM-DD"
                  style="width: 100%"
                />
              </a-form-item>
            </a-col>
            <a-col v-if="!isEdit && canEditAcceptance" :span="8">
              <a-form-item :label="t('projects.createForm.expectedAcceptance')">
                <a-date-picker
                  v-model="formData.expectedAcceptanceAt"
                  format="YYYY-MM-DD"
                  style="width: 100%"
                />
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="14">
            <a-col v-if="!isEdit" :span="8">
              <a-form-item :label="t('projects.createForm.initialStage')">
                <a-select v-model="formData.deliveryStage">
                  <a-option
                    v-for="item in STAGE_OPTIONS"
                    :key="item.value"
                    :label="t(item.label)"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item :label="t('projects.createForm.progress')">
                <a-input-number
                  v-model="formData.progressPercent"
                  :min="0"
                  :max="100"
                  :precision="0"
                  placeholder="0-100"
                  style="width: 100%"
                >
                  <template #suffix>
                    %
                  </template>
                </a-input-number>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item :label="t('projects.createForm.riskLevel')">
                <a-select v-model="formData.riskLevel">
                  <a-option
                    v-for="item in RISK_LEVEL_OPTIONS"
                    :key="item.value"
                    :label="t(item.label)"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item :label="t('projects.createForm.riskDescription')">
            <a-textarea
              v-model="formData.riskDescription"
              :max-length="2000"
              :auto-size="{ minRows: 2, maxRows: 5 }"
              show-word-limit
              :placeholder="t('projects.createForm.riskPlaceholder')"
            />
          </a-form-item>

          <a-divider orientation="left">
            {{ t('projects.createForm.team') }}
          </a-divider>
          <a-row :gutter="14">
            <a-col :span="12">
              <a-form-item :label="t('projects.createForm.salesOwner')">
                <a-select
                  v-model="formData.salesOwnerId"
                  allow-search
                  allow-clear
                  :placeholder="t('projects.createForm.salesPlaceholder')"
                >
                  <a-option
                    v-for="item in salesOwnerOptions"
                    :key="item.id"
                    :label="referenceLabel(item)"
                    :value="item.id"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item :label="t('projects.createForm.manager')">
                <a-select
                  v-model="formData.projectManagerId"
                  allow-search
                  allow-clear
                  :placeholder="t('projects.createForm.managerPlaceholder')"
                >
                  <a-option
                    v-for="item in projectManagerOptions"
                    :key="item.id"
                    :label="referenceLabel(item)"
                    :value="item.id"
                  />
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="14">
            <a-col :span="12">
              <a-form-item :label="t('projects.createForm.electricalOwner')">
                <a-select
                  v-model="formData.electricLeaderId"
                  allow-search
                  allow-clear
                  :placeholder="t('projects.createForm.selectPlaceholder')"
                >
                  <a-option
                    v-for="item in memberOptions"
                    :key="item.id"
                    :label="referenceLabel(item)"
                    :value="item.id"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item :label="t('projects.createForm.softwareOwner')">
                <a-select
                  v-model="formData.softwareLeaderId"
                  allow-search
                  allow-clear
                  :placeholder="t('projects.createForm.selectPlaceholder')"
                >
                  <a-option
                    v-for="item in memberOptions"
                    :key="item.id"
                    :label="referenceLabel(item)"
                    :value="item.id"
                  />
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="14">
            <a-col :span="12">
              <a-form-item :label="t('projects.createForm.purchaseOwner')">
                <a-select
                  v-model="formData.purchaseOwnerId"
                  allow-search
                  allow-clear
                  :placeholder="t('projects.createForm.selectPlaceholder')"
                >
                  <a-option
                    v-for="item in memberOptions"
                    :key="item.id"
                    :label="referenceLabel(item)"
                    :value="item.id"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item :label="t('projects.createForm.financeOwner')">
                <a-select
                  v-model="formData.financeOwnerId"
                  allow-search
                  allow-clear
                  :placeholder="t('projects.createForm.selectPlaceholder')"
                >
                  <a-option
                    v-for="item in memberOptions"
                    :key="item.id"
                    :label="referenceLabel(item)"
                    :value="item.id"
                  />
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>

          <StickyActionBar :message="t('projects.createForm.auditHint')">
            <template #actions>
              <a-button @click="handleCancel">
                {{ t('common.cancel') }}
              </a-button>
              <a-button type="primary" :loading="loading" @click="handleSubmit">
                {{
                  isEdit
                    ? t('projects.createForm.saveChanges')
                    : t('projects.createForm.createTitle')
                }}
              </a-button>
            </template>
          </StickyActionBar>
        </a-form>
      </a-spin>
    </SectionCard>
  </PageContainer>
</template>

<style scoped lang="scss">
.create-project-page {
  min-width: 0;
  height: 100%;
  overflow: auto;
}

.project-form-card {
  border-radius: 0;
}

.embedded .project-form-card :deep(.arco-card-body) {
  padding-top: 0;
}

.project-form-card :deep(.arco-card-body) {
  padding: 12px 16px 18px;
}

.load-alert {
  margin-bottom: 12px;
}

.project-form :deep(.arco-form-item) {
  margin-bottom: 12px;
}

.project-form :deep(.arco-form-item-label-col) {
  padding-bottom: 5px;
}

.project-form :deep(.arco-divider-text) {
  color: var(--color-text-1);
  font-size: 13px;
  font-weight: 650;
}

.form-actions {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0 2px;
  border-top: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
}

@media (max-width: 900px) {
  .project-form :deep(.arco-col) {
    flex: 0 0 100%;
    max-width: 100%;
  }
}
</style>
