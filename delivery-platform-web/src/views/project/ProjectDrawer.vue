<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Message, type FormInstance } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { projectApi } from '@/api/project'
import { hasHttpStatus } from '@/api/errors'
import { FormGrid, FormSection, ReadonlyField, StickyActionBar } from '@/components/business'
import { useProjectDetailQuery, useProjectFormOptionsQueries } from '@/composables/queries/useProjectQueries'
import { usePermission } from '@/composables/usePermission'
import { queryKeys } from '@/query/keys'
import type { ArchiveTemplate } from '@/types/archive'
import type { Country } from '@/types/country'
import type { Currency } from '@/types/currency'
import type {
  ContractType,
  CreateProjectDto,
  ProductType,
  ProjectDeliveryStage,
  ProjectKeyword,
  ProjectType,
  ProjectUserReferenceOption,
  UpdateProjectDto,
} from '@/types/project'
import { RISK_LEVEL_OPTIONS, STAGE_OPTIONS } from '@/types/project'
import { projectDictionaryColor, type ProjectDictionaryKind } from '@/utils/project-dictionaries'
import ProjectPaymentPlan from './components/ProjectPaymentPlan.vue'

const props = defineProps<{ mode: 'create' | 'edit'; projectId?: string }>()
const emit = defineEmits<{ saved: []; cancel: [] }>()
const queryClient = useQueryClient()
const { t } = useI18n()
const { hasAnyPermission } = usePermission()
const isEdit = computed(() => props.mode === 'edit')
const projectId = computed(() => props.projectId || '')
const canEditFinancial = computed(() => hasAnyPermission(['project:view_financial']))
const canEditContract = computed(() => hasAnyPermission(['project:view_contract']))
const canEditAcceptance = computed(() => hasAnyPermission(['project:view_acceptance']))
const formRef = ref<FormInstance>()

const formData = reactive({
  projectName: '', shortName: '', countryCode: 'CN', city: '', customerName: '',
  projectType: undefined as CreateProjectDto['projectType'],
  contractType: undefined as CreateProjectDto['contractType'],
  product: undefined as CreateProjectDto['product'],
  keywords: [] as ProjectKeyword[],
  projectLanguage: 'zh-CN', contractNo: '', contractCurrency: 'CNY', baseCurrency: 'CNY',
  contractAmount: undefined as number | undefined, contractSignedAt: '', startDate: '',
  plannedEndDate: '', expectedAcceptanceAt: '', deliveryStage: 'STARTUP' as ProjectDeliveryStage,
  progressPercent: 0, riskLevel: 'Low', riskDescription: '', salesOwnerId: '',
  projectManagerId: '', electricalOwnerId: '', softwareOwnerId: '', archiveTemplateId: '',
})

const idempotencyKey = ref(globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`)
const rules = {
  projectName: [{ required: true, message: t('projects.createForm.validationName') }],
  countryCode: [{ required: true, message: t('projects.createForm.validationCountry') }],
  projectType: [{ required: true, message: t('projects.createForm.validationProjectType') }],
  contractType: [{ required: true, message: t('projects.createForm.validationContractType') }],
  product: [{ required: true, message: t('projects.createForm.validationProduct') }],
  archiveTemplateId: [{ required: true, message: t('projects.createForm.validationArchiveTemplate') }],
}

const optionQueries = useProjectFormOptionsQueries(computed(() => !isEdit.value))
const projectQuery = useProjectDetailQuery(projectId)
const countryOptions = computed(() =>
  (optionQueries.value[0].data?.items ?? []).map((item: Country) => ({
    value: item.countryCode, label: `${item.nameZh} (${item.countryCode})`,
  })),
)
const currencyOptions = computed(() =>
  (optionQueries.value[1].data ?? []).map((item: Currency) => ({
    value: item.currencyCode, label: `${item.currencyName} (${item.currencyCode})`,
  })),
)
function configuredOptions<T extends string>(key: 'projectTypes' | 'contractTypes' | 'productTypes' | 'projectKeywords', kind: ProjectDictionaryKind) {
  return (optionQueries.value[3].data?.[key] ?? []).map((item) => ({
    ...item,
    value: item.value as T,
    color: projectDictionaryColor(kind, item.value),
  }))
}
const projectTypeOptions = computed(() => configuredOptions<ProjectType>('projectTypes', 'projectType'))
const contractTypeOptions = computed(() => configuredOptions<ContractType>('contractTypes', 'contractType'))
const productTypeOptions = computed(() => configuredOptions<ProductType>('productTypes', 'productType'))
const projectKeywordOptions = computed(() => configuredOptions<ProjectKeyword>('projectKeywords', 'projectKeyword'))
const salesOptions = computed<ProjectUserReferenceOption[]>(() => optionQueries.value[4].data ?? [])
const managerOptions = computed<ProjectUserReferenceOption[]>(() => optionQueries.value[5].data ?? [])
const memberOptions = computed<ProjectUserReferenceOption[]>(() => optionQueries.value[6].data ?? [])
const archiveOptions = computed(() =>
  ((optionQueries.value[7].data ?? []) as ArchiveTemplate[])
    .filter((item) => item.status === 'PUBLISHED')
    .map((item) => ({ value: item.id, label: `${item.templateName} (${item.templateCode})` })),
)
const loadingOptions = computed(() => optionQueries.value.some((query) => query.isFetching))

watch(() => projectQuery.data.value, (project) => {
  if (!project) return
  Object.assign(formData, {
    projectName: project.projectName, shortName: project.shortName || '', countryCode: project.countryCode,
    city: project.city || '', customerName: project.customerName || '', projectType: project.projectType || undefined,
    contractType: project.contractType || undefined, product: project.product || undefined,
    keywords: project.keywords || [], projectLanguage: project.projectLanguage || 'zh-CN',
    contractNo: project.contractNo || '', contractCurrency: project.contractCurrency || 'CNY',
    baseCurrency: project.baseCurrency || 'CNY', contractAmount: project.contractAmount ?? undefined,
    contractSignedAt: project.contractSignedAt?.slice(0, 10) || '', startDate: project.startDate?.slice(0, 10) || '',
    plannedEndDate: project.plannedEndDate?.slice(0, 10) || '', expectedAcceptanceAt: project.expectedAcceptanceAt?.slice(0, 10) || '',
    deliveryStage: project.currentStage, progressPercent: project.progressPercent ?? 0, riskLevel: project.riskLevel,
    riskDescription: project.riskDescription || '', salesOwnerId: project.salesOwnerId || '',
    projectManagerId: project.projectManagerId || '', electricalOwnerId: project.electricalOwnerId || '',
    softwareOwnerId: project.softwareOwnerId || '', archiveTemplateId: project.archiveTemplateId || '',
  })
}, { immediate: true })

function personLabel(option: ProjectUserReferenceOption): string {
  return `${option.displayName} (${option.name})${option.departmentName ? ` · ${option.departmentName}` : ''}`
}

function commonPayload(): Omit<UpdateProjectDto, 'revision'> {
  const payload: Omit<UpdateProjectDto, 'revision'> = {
    projectName: formData.projectName.trim(), shortName: formData.shortName.trim() || undefined,
    countryCode: formData.countryCode, city: formData.city.trim() || undefined,
    customerName: formData.customerName.trim() || undefined, projectType: formData.projectType,
    contractType: formData.contractType, product: formData.product, keywords: formData.keywords,
    projectLanguage: formData.projectLanguage, startDate: formData.startDate || undefined,
    plannedEndDate: formData.plannedEndDate || undefined, riskLevel: formData.riskLevel,
    riskDescription: formData.riskDescription.trim() || undefined, salesOwnerId: formData.salesOwnerId || undefined,
    projectManagerId: formData.projectManagerId || undefined, electricalOwnerId: formData.electricalOwnerId || undefined,
    softwareOwnerId: formData.softwareOwnerId || undefined,
  }
  if (canEditContract.value) {
    payload.contractNo = formData.contractNo.trim() || undefined
    payload.contractSignedAt = formData.contractSignedAt || undefined
  }
  if (canEditFinancial.value) {
    payload.contractCurrency = formData.contractCurrency
    payload.baseCurrency = formData.baseCurrency
    payload.contractAmount = formData.contractAmount
  }
  return payload
}

type Variables = { kind: 'update'; id: string; data: UpdateProjectDto } |
  { kind: 'create'; data: CreateProjectDto; key: string }
const mutation = useMutation({
  mutationFn: (variables: Variables) => variables.kind === 'update'
    ? projectApi.update(variables.id, variables.data)
    : projectApi.create(variables.data, variables.key),
  retry: false,
})

async function save(saveAsDraft = false): Promise<void> {
  if (!formRef.value) return
  const validation = await formRef.value.validate().catch((error: unknown) => error)
  if (validation) return
  try {
    if (isEdit.value) {
      const project = projectQuery.data.value
      if (!project) return
      await mutation.mutateAsync({ kind: 'update', id: project.id, data: { ...commonPayload(), revision: project.revision } })
    } else {
      await mutation.mutateAsync({
        kind: 'create', key: idempotencyKey.value,
        data: {
          ...commonPayload(), projectName: formData.projectName.trim(), countryCode: formData.countryCode,
          archiveTemplateId: formData.archiveTemplateId, deliveryStage: formData.deliveryStage,
          progressPercent: formData.progressPercent,
          expectedAcceptanceAt: canEditAcceptance.value ? formData.expectedAcceptanceAt || undefined : undefined,
          saveAsDraft,
        },
      })
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.summary() }),
    ])
    Message.success(saveAsDraft ? t('projects.createForm.draftSaved') : isEdit.value ? t('projects.createForm.updated') : t('projects.createForm.created'))
    emit('saved')
  } catch (error) {
    if (hasHttpStatus(error, 409)) {
      Message.warning(t('projects.conflict'))
      await projectQuery.refetch()
    }
  }
}
</script>

<template>
  <a-spin :loading="loadingOptions || projectQuery.isFetching.value">
    <a-form
      ref="formRef"
      :model="formData"
      :rules="rules"
      layout="vertical"
      class="project-form"
    >
      <FormSection :title="t('projects.createForm.basic')">
        <FormGrid :columns="4">
          <ReadonlyField class="span-2" :label="t('projects.detailPage.projectCode')" :value="isEdit ? projectQuery.data.value?.projectCode : t('projects.createForm.codePreview')" />
          <a-form-item class="span-2" :label="t('projects.createForm.projectName')" field="projectName">
            <a-input v-model="formData.projectName" :max-length="200" />
          </a-form-item>
          <a-form-item :label="t('projects.createForm.shortName')">
            <a-input v-model="formData.shortName" :max-length="100" />
          </a-form-item>
          <a-form-item class="span-2" :label="t('projects.createForm.customer')">
            <a-input v-model="formData.customerName" :max-length="200" />
          </a-form-item>
          <a-form-item :label="t('projects.createForm.country')" field="countryCode">
            <a-select v-model="formData.countryCode" allow-search>
              <a-option v-for="item in countryOptions" :key="item.value" v-bind="item" />
            </a-select>
          </a-form-item>
          <a-form-item :label="t('projects.createForm.city')">
            <a-input v-model="formData.city" />
          </a-form-item>
          <a-form-item :label="t('projects.createForm.language')">
            <a-select v-model="formData.projectLanguage">
              <a-option value="zh-CN" :label="t('shell.locale.zhCN')" /><a-option value="en-US" label="English" />
            </a-select>
          </a-form-item>
        </FormGrid>
      </FormSection>

      <FormSection :title="t('projects.sections.classification')">
        <FormGrid :columns="4">
          <a-form-item :label="t('projects.createForm.projectType')" field="projectType">
            <a-select v-model="formData.projectType">
              <a-option
                v-for="item in projectTypeOptions"
                :key="item.value"
                :value="item.value"
                :label="item.label"
              />
            </a-select>
          </a-form-item>
          <a-form-item :label="t('projects.createForm.contractType')" field="contractType">
            <a-select v-model="formData.contractType">
              <a-option
                v-for="item in contractTypeOptions"
                :key="item.value"
                :value="item.value"
                :label="item.label"
              />
            </a-select>
          </a-form-item>
          <a-form-item :label="t('projects.createForm.product')" field="product">
            <a-select v-model="formData.product">
              <a-option
                v-for="item in productTypeOptions"
                :key="item.value"
                :value="item.value"
                :label="item.label"
              />
            </a-select>
          </a-form-item>
          <a-form-item class="span-full keyword-field" :label="t('projects.createForm.keywords')">
            <a-select
              v-model="formData.keywords"
              multiple
              allow-search
              allow-clear
            >
              <a-option
                v-for="item in projectKeywordOptions"
                :key="item.value"
                :value="item.value"
                :label="item.label"
              />
            </a-select>
            <a-space v-if="formData.keywords.length" class="keyword-preview" wrap>
              <a-tag v-for="value in formData.keywords" :key="value" :color="projectKeywordOptions.find((item) => item.value === value)?.color">
                {{ projectKeywordOptions.find((item) => item.value === value)?.label || value }}
              </a-tag>
            </a-space>
          </a-form-item>
        </FormGrid>
      </FormSection>

      <FormSection :title="t('projects.createForm.contractSection')">
        <FormGrid :columns="4">
          <a-form-item :label="t('projects.createForm.contractNo')">
            <a-input v-model="formData.contractNo" :disabled="!canEditContract" />
          </a-form-item>
          <a-form-item :label="t('projects.createForm.signedAt')">
            <a-date-picker v-model="formData.contractSignedAt" format="YYYY-MM-DD" :disabled="!canEditContract" />
          </a-form-item>
          <a-form-item :label="t('projects.createForm.sourceCurrency')">
            <a-select v-model="formData.contractCurrency" allow-search :disabled="!canEditFinancial">
              <a-option v-for="item in currencyOptions" :key="item.value" v-bind="item" />
            </a-select>
          </a-form-item>
          <a-form-item :label="t('projects.createForm.convertedCurrency')">
            <a-select v-model="formData.baseCurrency" allow-search :disabled="!canEditFinancial">
              <a-option v-for="item in currencyOptions" :key="item.value" v-bind="item" />
            </a-select>
          </a-form-item>
          <a-form-item :label="t('projects.createForm.contractAmount')">
            <a-input-number
              v-model="formData.contractAmount"
              :min="0"
              :precision="2"
              :disabled="!canEditFinancial"
            />
          </a-form-item>
        </FormGrid>
      </FormSection>

      <FormSection :title="t('projects.sections.planProgress')">
        <FormGrid :columns="4">
          <a-form-item :label="t('projects.createForm.plannedStart')">
            <a-date-picker v-model="formData.startDate" format="YYYY-MM-DD" />
          </a-form-item>
          <a-form-item :label="t('projects.createForm.plannedEnd')">
            <a-date-picker v-model="formData.plannedEndDate" format="YYYY-MM-DD" />
          </a-form-item>
          <template v-if="!isEdit">
            <a-form-item :label="t('projects.columns.currentStage')">
              <a-select v-model="formData.deliveryStage">
                <a-option
                  v-for="item in STAGE_OPTIONS"
                  :key="item.value"
                  :value="item.value"
                  :label="item.label"
                />
              </a-select>
            </a-form-item>
            <a-form-item :label="t('projects.progress.percent')">
              <a-input-number v-model="formData.progressPercent" :min="0" :max="100" />
            </a-form-item>
            <a-form-item :label="t('projects.createForm.expectedAcceptance')">
              <a-date-picker v-model="formData.expectedAcceptanceAt" format="YYYY-MM-DD" :disabled="!canEditAcceptance" />
            </a-form-item>
          </template>
          <template v-else>
            <ReadonlyField :label="t('projects.columns.currentStage')" :value="projectQuery.data.value?.currentStage" />
            <ReadonlyField :label="t('projects.columns.progress')" :value="`${formData.progressPercent}%`" />
            <ReadonlyField :label="t('projects.createForm.expectedAcceptance')" :value="formData.expectedAcceptanceAt" />
          </template>
        </FormGrid>
      </FormSection>

      <FormSection :title="t('projects.createForm.team')">
        <FormGrid :columns="4">
          <a-form-item :label="t('projects.createForm.salesOwner')">
            <a-select v-model="formData.salesOwnerId" allow-search allow-clear>
              <a-option
                v-for="item in salesOptions"
                :key="item.id"
                :value="item.id"
                :label="personLabel(item)"
              />
            </a-select>
          </a-form-item>
          <a-form-item :label="t('projects.createForm.manager')">
            <a-select v-model="formData.projectManagerId" allow-search allow-clear>
              <a-option
                v-for="item in managerOptions"
                :key="item.id"
                :value="item.id"
                :label="personLabel(item)"
              />
            </a-select>
          </a-form-item>
          <a-form-item :label="t('projects.createForm.electricalOwner')">
            <a-select v-model="formData.electricalOwnerId" allow-search allow-clear>
              <a-option
                v-for="item in memberOptions"
                :key="item.id"
                :value="item.id"
                :label="personLabel(item)"
              />
            </a-select>
          </a-form-item>
          <a-form-item :label="t('projects.createForm.softwareOwner')">
            <a-select v-model="formData.softwareOwnerId" allow-search allow-clear>
              <a-option
                v-for="item in memberOptions"
                :key="item.id"
                :value="item.id"
                :label="personLabel(item)"
              />
            </a-select>
          </a-form-item>
        </FormGrid>
      </FormSection>

      <FormSection :title="t('projects.sections.riskNotes')">
        <FormGrid :columns="4">
          <a-form-item :label="t('projects.createForm.riskLevel')">
            <a-select v-model="formData.riskLevel">
              <a-option
                v-for="item in RISK_LEVEL_OPTIONS"
                :key="item.value"
                :value="item.value"
                :label="item.label"
              />
            </a-select>
          </a-form-item>
          <a-form-item class="span-full" :label="t('projects.createForm.riskDescription')">
            <a-textarea v-model="formData.riskDescription" :max-length="2000" :auto-size="{ minRows: 3, maxRows: 6 }" />
          </a-form-item>
        </FormGrid>
      </FormSection>

      <FormSection :title="t('projects.createForm.archiveTemplate')">
        <FormGrid>
          <a-form-item
            v-if="!isEdit"
            class="span-2"
            :label="t('projects.createForm.archiveTemplate')"
            field="archiveTemplateId"
          >
            <a-select v-model="formData.archiveTemplateId" allow-search>
              <a-option v-for="item in archiveOptions" :key="item.value" v-bind="item" />
            </a-select>
          </a-form-item>
          <ReadonlyField
            v-else
            class="span-2"
            :label="t('projects.createForm.archiveTemplate')"
            :value="projectQuery.data.value?.archiveTemplateId"
          />
        </FormGrid>
      </FormSection>

      <ProjectPaymentPlan
        v-if="isEdit && projectQuery.data.value"
        :project-id="projectQuery.data.value.id"
        :contract-amount="formData.contractAmount"
        :contract-currency="formData.contractCurrency"
        :converted-currency="formData.baseCurrency"
      />
    </a-form>

    <StickyActionBar>
      <template #actions>
        <a-button @click="emit('cancel')">
          {{ t('common.cancel') }}
        </a-button>
        <a-button v-if="!isEdit" :loading="mutation.isPending.value" @click="save(true)">
          {{ t('projects.createForm.saveDraft') }}
        </a-button>
        <a-button type="primary" :loading="mutation.isPending.value" @click="save(false)">
          {{ isEdit ? t('projects.createForm.saveChanges') : t('projects.create') }}
        </a-button>
      </template>
    </StickyActionBar>
  </a-spin>
</template>

<style scoped>
.project-form { padding: 2px 4px 24px; }
.project-form :deep(.arco-picker), .project-form :deep(.arco-input-number) { width: 100%; }
.keyword-field :deep(.arco-select-view-multiple) { min-height: 68px; align-items: flex-start; }
.keyword-preview { margin-top: 8px; }
</style>
