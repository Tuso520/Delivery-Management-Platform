<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Message, type FormInstance } from '@arco-design/web-vue'
import { IconClose, IconSave } from '@arco-design/web-vue/es/icon'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { projectApi } from '@/api/project'
import { hasHttpStatus } from '@/api/errors'
import {
  useProjectDetailQuery,
  useProjectFormOptionsQueries,
  useProjectPaymentsQuery,
} from '@/composables/queries/useProjectQueries'
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
import { STAGE_OPTIONS } from '@/types/project'
import type {
  ProjectPayment,
  ProjectPaymentPlanItem,
  ProjectPaymentPlanWriteItem,
} from '@/types/project-payment'
import { arcoConfirm } from '@/utils/arco-dialog'
import {
  isMoney,
  moneyToMinor,
  multiplyMoneyByRate,
  normalizeMoneyInput,
} from '@/utils/decimal-money'
import { projectDictionaryColor, type ProjectDictionaryKind } from '@/utils/project-dictionaries'
import { localizeProjectStage } from '@/utils/project-localization'
import ProjectPaymentPlan from './components/ProjectPaymentPlan.vue'

export type ProjectDetailDialogMode = 'create' | 'edit' | 'view'

const props = defineProps<{
  visible: boolean
  mode: ProjectDetailDialogMode
  projectId?: string
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: []
}>()

const queryClient = useQueryClient()
const { hasAnyPermission, hasPermission } = usePermission()
const formRef = ref<FormInstance>()
const initialSnapshot = ref('')
const payments = ref<ProjectPaymentPlanItem[]>([])
const isCreate = computed(() => props.mode === 'create')
const isView = computed(() => props.mode === 'view')
const projectId = computed(() => props.projectId || '')
const canViewPayments = computed(() => hasPermission('payment:view'))
const projectQuery = useProjectDetailQuery(projectId)
const paymentQuery = useProjectPaymentsQuery(projectId, computed(() =>
  props.visible && !isCreate.value && canViewPayments.value,
))
const optionQueries = useProjectFormOptionsQueries(true, computed(() => !isCreate.value))
const project = computed(() => projectQuery.data.value)
const readonly = computed(() => isView.value || (props.mode === 'edit' && project.value?.canEdit === false))
const canEditFinancial = computed(() => !readonly.value && hasAnyPermission(['project:view_financial']))
const canEditContract = computed(() => !readonly.value && hasAnyPermission(['project:view_contract']))
const canUpdateProgress = computed(() =>
  !readonly.value && (isCreate.value || project.value?.canUpdateProgress === true),
)
const canEditAcceptance = computed(() =>
  canUpdateProgress.value && hasAnyPermission(['project:view_acceptance']),
)
const canOperatePayments = computed(() =>
  !readonly.value &&
  canViewPayments.value &&
  canEditFinancial.value &&
  hasPermission('payment:operate'),
)

const formData = reactive({
  projectName: '',
  shortName: '',
  projectCode: '',
  customerName: '',
  countryCode: 'CN',
  city: '',
  projectType: undefined as ProjectType | undefined,
  contractType: undefined as ContractType | undefined,
  product: undefined as ProductType | undefined,
  keywords: [] as ProjectKeyword[],
  contractCurrency: 'CNY',
  contractAmount: '',
  convertedAmount: '',
  archiveTemplateId: '',
  contractNo: '',
  contractSignedAt: '',
  startDate: '',
  expectedAcceptanceAt: '',
  salesOwnerId: '',
  projectManagerId: '',
  electricalOwnerId: '',
  softwareOwnerId: '',
  deliveryStage: 'STARTUP' as ProjectDeliveryStage,
  progressPercent: 0,
})
const rules = {
  projectName: [{ required: true, message: '请输入合同名称' }],
  countryCode: [{ required: true, message: '请选择国家' }],
  projectType: [{ required: true, message: '请选择客户类型' }],
  contractType: [{ required: true, message: '请选择合同类型' }],
  product: [{ required: true, message: '请选择产品类型' }],
  archiveTemplateId: [{ required: true, message: '请选择档案模版' }],
}
const idempotencyKey = ref('')

function configuredOptions<T extends string>(
  key: 'projectTypes' | 'contractTypes' | 'productTypes' | 'projectKeywords',
  kind: ProjectDictionaryKind,
  currentValues: Array<string | undefined>,
) {
  const historicalValues = new Set(currentValues.filter((value): value is string => Boolean(value)))
  return (optionQueries.value[3].data?.[key] ?? [])
    .filter((item) => item.status === 'Active' || historicalValues.has(item.value))
    .map((item) => ({
      ...item,
      value: item.value as T,
      color: projectDictionaryColor(kind, item.value),
      disabled: item.status !== 'Active',
    }))
}
const countryOptions = computed(() =>
  (optionQueries.value[0].data?.items ?? []).map((item: Country) => ({
    value: item.countryCode,
    label: `${item.nameZh} (${item.countryCode})`,
  })),
)
const currencies = computed<Currency[]>(() => optionQueries.value[1].data ?? [])
const currencyOptions = computed(() =>
  currencies.value.map((item) => ({
    value: item.currencyCode,
    label: `${item.currencyName} (${item.currencyCode})`,
  })),
)
const projectTypeOptions = computed(() =>
  configuredOptions<ProjectType>('projectTypes', 'projectType', [formData.projectType]),
)
const contractTypeOptions = computed(() =>
  configuredOptions<ContractType>('contractTypes', 'contractType', [formData.contractType]),
)
const productTypeOptions = computed(() =>
  configuredOptions<ProductType>('productTypes', 'productType', [formData.product]),
)
const keywordOptions = computed(() =>
  configuredOptions<ProjectKeyword>('projectKeywords', 'projectKeyword', formData.keywords),
)
const salesOptions = computed<ProjectUserReferenceOption[]>(() => optionQueries.value[4].data ?? [])
const managerOptions = computed<ProjectUserReferenceOption[]>(() => optionQueries.value[5].data ?? [])
const memberOptions = computed<ProjectUserReferenceOption[]>(() => optionQueries.value[6].data ?? [])
const archiveOptions = computed(() =>
  ((optionQueries.value[7].data ?? []) as ArchiveTemplate[])
    .filter((item) => item.status === 'PUBLISHED' || item.id === formData.archiveTemplateId)
    .map((item) => ({ value: item.id, label: `${item.templateName} (${item.templateCode})` })),
)
const loading = computed(() =>
  optionQueries.value.some((query) => query.isFetching) ||
  (!isCreate.value && projectQuery.isFetching.value) ||
  (!isCreate.value && canViewPayments.value && paymentQuery.isFetching.value),
)
const convertedAmount = computed(() => {
  if ((isView.value || !canEditFinancial.value) && formData.convertedAmount) {
    return formData.convertedAmount
  }
  if (!formData.contractAmount) return undefined
  if (formData.contractCurrency === 'CNY') return formData.contractAmount
  const currency = currencies.value.find((item) => item.currencyCode === formData.contractCurrency)
  return multiplyMoneyByRate(formData.contractAmount, currency?.cnyRate)
})
const snapshot = computed(() => JSON.stringify({ formData, payments: payments.value }))
const dirty = computed(() => !readonly.value && Boolean(initialSnapshot.value) && snapshot.value !== initialSnapshot.value)
const paymentRatioValid = computed(() => {
  if (!canOperatePayments.value) return true
  if (!formData.contractAmount || payments.value.length === 0) return true
  const total = payments.value.reduce(
    (sum, item) => sum + moneyToMinor(item.originalAmount),
    0n,
  )
  return total === moneyToMinor(formData.contractAmount)
})

function blankForm(): void {
  Object.assign(formData, {
    projectName: '',
    shortName: '',
    projectCode: '',
    customerName: '',
    countryCode: 'CN',
    city: '',
    projectType: undefined,
    contractType: undefined,
    product: undefined,
    keywords: [],
    contractCurrency: 'CNY',
    contractAmount: '',
    convertedAmount: '',
    archiveTemplateId: '',
    contractNo: '',
    contractSignedAt: '',
    startDate: '',
    expectedAcceptanceAt: '',
    salesOwnerId: '',
    projectManagerId: '',
    electricalOwnerId: '',
    softwareOwnerId: '',
    deliveryStage: 'STARTUP',
    progressPercent: 0,
  })
  payments.value = []
  idempotencyKey.value = globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`
  formRef.value?.clearValidate()
}
function captureSnapshot(): void {
  initialSnapshot.value = snapshot.value
}
function assignProject(): void {
  const value = project.value
  if (!value) return
  Object.assign(formData, {
    projectName: value.projectName,
    shortName: value.shortName || '',
    projectCode: value.projectCode,
    customerName: value.customerName || '',
    countryCode: value.countryCode,
    city: value.city || '',
    projectType: value.projectType || undefined,
    contractType: value.contractType || undefined,
    product: value.product || undefined,
    keywords: value.keywords || [],
    contractCurrency: value.contractCurrency || 'CNY',
    contractAmount: value.contractAmount ?? '',
    convertedAmount: value.convertedAmount ?? '',
    archiveTemplateId: value.archiveTemplateId || '',
    contractNo: value.contractNo || '',
    contractSignedAt: value.contractSignedAt?.slice(0, 10) || '',
    startDate: value.startDate?.slice(0, 10) || '',
    expectedAcceptanceAt: value.expectedAcceptanceAt?.slice(0, 10) || '',
    salesOwnerId: value.salesOwnerId || '',
    projectManagerId: value.projectManagerId || '',
    electricalOwnerId: value.electricalOwnerId || '',
    softwareOwnerId: value.softwareOwnerId || '',
    deliveryStage: value.currentStage,
    progressPercent: value.progressPercent ?? 0,
  })
}
function assignPayments(items: ProjectPayment[]): void {
  payments.value = items.map((item) => ({
    id: item.id,
    paymentName: item.paymentName,
    dueDate: item.dueDate?.slice(0, 10) || '',
    completed: item.status === 'Received',
    receivedDate: item.receivedDate,
    originalAmount: item.originalAmount,
    remark: item.remark || '',
  }))
}

watch(
  () => [props.visible, props.mode, props.projectId] as const,
  ([visible]) => {
    if (!visible) return
    initialSnapshot.value = ''
    blankForm()
    if (isCreate.value) {
      queueMicrotask(captureSnapshot)
      return
    }
    if (!project.value) return
    assignProject()
    if (!canViewPayments.value || paymentQuery.data.value) {
      if (paymentQuery.data.value) assignPayments(paymentQuery.data.value.items)
      queueMicrotask(captureSnapshot)
    }
  },
  { immediate: true },
)
watch(project, () => {
  if (!props.visible || isCreate.value || !project.value) return
  assignProject()
  if (!canViewPayments.value || paymentQuery.data.value) {
    if (paymentQuery.data.value) assignPayments(paymentQuery.data.value.items)
    queueMicrotask(captureSnapshot)
  }
})
watch(() => paymentQuery.data.value, (value) => {
  if (!props.visible || isCreate.value || !value) return
  assignPayments(value.items)
  queueMicrotask(captureSnapshot)
}, { immediate: true })
watch(() => paymentQuery.isError.value, (isError) => {
  if (!props.visible || isCreate.value || !isError || !project.value) return
  queueMicrotask(captureSnapshot)
})

function personLabel(option: ProjectUserReferenceOption): string {
  return `${option.displayName} (${option.name})${option.departmentName ? ` · ${option.departmentName}` : ''}`
}
function paymentPayload(): ProjectPaymentPlanWriteItem[] | undefined {
  if (!canOperatePayments.value) return undefined
  return payments.value.map((item) => ({
    id: item.id,
    paymentName: item.paymentName,
    paymentType: 'Milestone',
    dueDate: item.dueDate || null,
    originalAmount: item.originalAmount,
    originalCurrency: formData.contractCurrency,
    convertedCurrency: 'CNY',
    receivedOriginalAmount: item.completed ? item.originalAmount : '0',
    receivedDate: item.completed ? item.receivedDate || new Date().toISOString() : null,
    remark: item.remark || undefined,
  }))
}
function commonPayload(): Omit<UpdateProjectDto, 'revision'> {
  const plans = paymentPayload()
  const optionalText = (value: string): string | null | undefined =>
    value.trim() || (isCreate.value ? undefined : null)
  const optionalDate = (value: string): string | null | undefined =>
    value || (isCreate.value ? undefined : null)
  const payload: Omit<UpdateProjectDto, 'revision'> = {
    projectName: formData.projectName.trim(),
    shortName: optionalText(formData.shortName),
    countryCode: formData.countryCode,
    city: optionalText(formData.city),
    customerName: optionalText(formData.customerName),
    projectType: formData.projectType,
    contractType: formData.contractType,
    product: formData.product,
    keywords: formData.keywords,
    startDate: optionalDate(formData.startDate),
    salesOwnerId: optionalText(formData.salesOwnerId),
    projectManagerId: optionalText(formData.projectManagerId),
    electricalOwnerId: optionalText(formData.electricalOwnerId),
    softwareOwnerId: optionalText(formData.softwareOwnerId),
    ...(plans === undefined ? {} : { paymentPlans: plans }),
  }
  if (canEditFinancial.value) {
    payload.contractCurrency = formData.contractCurrency
    payload.baseCurrency = 'CNY'
    payload.contractAmount = formData.contractAmount || undefined
  }
  if (canEditContract.value) {
    payload.contractNo = optionalText(formData.contractNo)
    payload.contractSignedAt = optionalDate(formData.contractSignedAt)
  }
  return payload
}
function datesValid(): boolean {
  if (
    formData.contractSignedAt &&
    formData.startDate &&
    formData.startDate < formData.contractSignedAt
  ) {
    Message.warning('开始时间不能早于签约时间')
    return false
  }
  if (
    formData.startDate &&
    formData.expectedAcceptanceAt &&
    formData.expectedAcceptanceAt < formData.startDate
  ) {
    Message.warning('验收时间不能早于开始时间')
    return false
  }
  return true
}
type SaveVariables =
  | { kind: 'create'; data: CreateProjectDto; key: string }
  | { kind: 'update'; id: string; data: UpdateProjectDto }
const mutation = useMutation({
  mutationFn: (variables: SaveVariables) =>
    variables.kind === 'create'
      ? projectApi.create(variables.data, variables.key)
      : projectApi.update(variables.id, variables.data),
  retry: false,
})
async function save(): Promise<void> {
  if (readonly.value || mutation.isPending.value || !formRef.value) return
  const validation = await formRef.value.validate().catch((error: unknown) => error)
  if (validation) return
  if (formData.contractAmount && !isMoney(formData.contractAmount)) {
    Message.warning('请输入有效合同金额，最多保留两位小数')
    return
  }
  if (!datesValid()) return
  if (!paymentRatioValid.value) {
    Message.warning('款项计划付款比例合计必须为 100.00%')
    return
  }
  try {
    let savedProjectId = ''
    if (isCreate.value) {
      const savedProject = await mutation.mutateAsync({
        kind: 'create',
        key: idempotencyKey.value,
        data: {
          ...commonPayload(),
          projectName: formData.projectName.trim(),
          countryCode: formData.countryCode,
          archiveTemplateId: formData.archiveTemplateId,
          deliveryStage: formData.deliveryStage,
          progressPercent: formData.progressPercent,
          expectedAcceptanceAt: canEditAcceptance.value
            ? formData.expectedAcceptanceAt || undefined
            : undefined,
        },
      })
      savedProjectId = savedProject.id
    } else {
      if (!project.value) return
      const progressPayload = canUpdateProgress.value
        ? {
            deliveryStage: formData.deliveryStage,
            progressPercent: formData.progressPercent,
            expectedAcceptanceAt: canEditAcceptance.value
              ? formData.expectedAcceptanceAt || null
              : undefined,
          }
        : {}
      const savedProject = await mutation.mutateAsync({
        kind: 'update',
        id: project.value.id,
        data: {
          ...commonPayload(),
          revision: project.value.revision,
          ...progressPayload,
        },
      })
      savedProjectId = savedProject.id
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.summary() }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.detail(savedProjectId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.payments(savedProjectId),
      }),
    ])
    Message.success(isCreate.value ? '项目已创建' : '项目已更新')
    initialSnapshot.value = snapshot.value
    emit('saved')
    emit('update:visible', false)
  } catch (error) {
    if (hasHttpStatus(error, 409)) {
      Message.warning('项目已被其他人修改，请刷新后重试')
      await projectQuery.refetch()
    }
  }
}
function updateContractAmount(value: string): void {
  formData.contractAmount = normalizeMoneyInput(value)
}
async function confirmClose(): Promise<boolean> {
  if (!dirty.value) return true
  try {
    await arcoConfirm('当前修改尚未保存，确定关闭项目详情吗？', '未保存修改', {
      confirmButtonText: '放弃修改',
      cancelButtonText: '继续编辑',
      type: 'warning',
    })
    return true
  } catch {
    return false
  }
}
async function close(): Promise<void> {
  if (await confirmClose()) emit('update:visible', false)
}
function beforeCancel(): boolean {
  void close()
  return false
}
</script>

<template>
  <a-modal
    class="project-detail-dialog"
    :visible="visible"
    :width="944"
    :footer="false"
    :closable="false"
    :mask-closable="true"
    :unmount-on-close="true"
    :on-before-cancel="beforeCancel"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="dialog-shell">
      <header class="dialog-header">
        <h2>项目详情</h2>
        <div class="dialog-actions">
          <a-button
            v-if="!readonly"
            type="primary"
            :loading="mutation.isPending.value"
            @click="save"
          >
            <template #icon>
              <IconSave />
            </template>
            保存
          </a-button>
          <button
            type="button"
            class="dialog-close"
            aria-label="关闭"
            @click="close"
          >
            <IconClose />
          </button>
        </div>
      </header>

      <div class="dialog-body">
        <a-spin :loading="loading">
          <a-result
            v-if="!isCreate && projectQuery.isError.value"
            status="error"
            title="项目详情加载失败"
          >
            <template #extra>
              <a-button @click="projectQuery.refetch()">
                重新加载
              </a-button>
            </template>
          </a-result>
          <a-form
            v-else
            ref="formRef"
            :model="formData"
            :rules="rules"
            layout="vertical"
            class="project-detail-form"
            :disabled="readonly"
          >
            <section class="basic-section">
              <div class="section-heading">
                <h3>基础信息</h3>
              </div>

              <div class="form-row form-row-wide">
                <a-form-item label="合同名称" field="projectName">
                  <a-input v-model="formData.projectName" placeholder="请录入项目完整合同名称" :max-length="200" />
                </a-form-item>
                <a-form-item label="项目简称">
                  <a-input v-model="formData.shortName" placeholder="建议：地名+客户简称+合同关键词" :max-length="100" />
                </a-form-item>
                <a-form-item label="项目编号">
                  <a-input :model-value="formData.projectCode" placeholder="保存后自动生成" disabled />
                </a-form-item>
              </div>

              <div class="form-row form-row-wide">
                <a-form-item label="客户名称">
                  <a-input v-model="formData.customerName" placeholder="请输入客户完整名称" :max-length="200" />
                </a-form-item>
                <a-form-item label="国家" field="countryCode">
                  <a-select v-model="formData.countryCode" placeholder="请选择" allow-search>
                    <a-option v-for="item in countryOptions" :key="item.value" v-bind="item" />
                  </a-select>
                </a-form-item>
                <a-form-item label="城市">
                  <a-input v-model="formData.city" />
                </a-form-item>
              </div>

              <div class="form-row">
                <a-form-item label="客户类型" field="projectType">
                  <a-select v-model="formData.projectType">
                    <a-option v-for="item in projectTypeOptions" :key="item.value" v-bind="item" />
                  </a-select>
                </a-form-item>
                <a-form-item label="合同类型" field="contractType">
                  <a-select v-model="formData.contractType">
                    <a-option v-for="item in contractTypeOptions" :key="item.value" v-bind="item" />
                  </a-select>
                </a-form-item>
                <a-form-item label="产品类型" field="product">
                  <a-select v-model="formData.product">
                    <a-option v-for="item in productTypeOptions" :key="item.value" v-bind="item" />
                  </a-select>
                </a-form-item>
                <a-form-item label="项目关键词">
                  <a-select
                    v-model="formData.keywords"
                    multiple
                    allow-search
                    allow-clear
                  >
                    <a-option v-for="item in keywordOptions" :key="item.value" v-bind="item" />
                  </a-select>
                </a-form-item>
              </div>

              <div class="form-row">
                <a-form-item label="合同币种">
                  <a-select v-model="formData.contractCurrency" allow-search :disabled="!canEditFinancial">
                    <a-option v-for="item in currencyOptions" :key="item.value" v-bind="item" />
                  </a-select>
                </a-form-item>
                <a-form-item label="合同金额">
                  <a-input
                    :model-value="formData.contractAmount"
                    placeholder="请输入合同金额"
                    :disabled="!canEditFinancial"
                    @input="updateContractAmount"
                  />
                </a-form-item>
                <a-form-item label="折算人民币金额">
                  <a-input :model-value="convertedAmount" placeholder="自动计算" disabled />
                </a-form-item>
                <a-form-item label="档案模版" field="archiveTemplateId">
                  <a-select
                    v-model="formData.archiveTemplateId"
                    placeholder="请选择"
                    allow-search
                    :disabled="!isCreate"
                  >
                    <a-option v-for="item in archiveOptions" :key="item.value" v-bind="item" />
                  </a-select>
                </a-form-item>
              </div>

              <div class="form-row">
                <a-form-item label="合同编号">
                  <a-input v-model="formData.contractNo" placeholder="请输入合同编号" :disabled="!canEditContract" />
                </a-form-item>
                <a-form-item label="签约时间">
                  <a-date-picker v-model="formData.contractSignedAt" format="YYYY-MM-DD" :disabled="!canEditContract" />
                </a-form-item>
                <a-form-item label="开始时间">
                  <a-date-picker v-model="formData.startDate" format="YYYY-MM-DD" />
                </a-form-item>
                <a-form-item label="验收时间">
                  <a-date-picker v-model="formData.expectedAcceptanceAt" format="YYYY-MM-DD" :disabled="!canEditAcceptance" />
                </a-form-item>
              </div>

              <div class="form-row">
                <a-form-item label="销售负责人">
                  <a-select v-model="formData.salesOwnerId" allow-search allow-clear>
                    <a-option
                      v-for="item in salesOptions"
                      :key="item.id"
                      :value="item.id"
                      :label="personLabel(item)"
                    />
                  </a-select>
                </a-form-item>
                <a-form-item label="项目经理">
                  <a-select v-model="formData.projectManagerId" allow-search allow-clear>
                    <a-option
                      v-for="item in managerOptions"
                      :key="item.id"
                      :value="item.id"
                      :label="personLabel(item)"
                    />
                  </a-select>
                </a-form-item>
                <a-form-item label="电气工程师">
                  <a-select v-model="formData.electricalOwnerId" allow-search allow-clear>
                    <a-option
                      v-for="item in memberOptions"
                      :key="item.id"
                      :value="item.id"
                      :label="personLabel(item)"
                    />
                  </a-select>
                </a-form-item>
                <a-form-item label="软件工程师">
                  <a-select v-model="formData.softwareOwnerId" allow-search allow-clear>
                    <a-option
                      v-for="item in memberOptions"
                      :key="item.id"
                      :value="item.id"
                      :label="personLabel(item)"
                    />
                  </a-select>
                </a-form-item>
              </div>
            </section>

            <ProjectPaymentPlan
              v-model="payments"
              :readonly="readonly"
              :loading="paymentQuery.isFetching.value"
              :contract-amount="formData.contractAmount"
              :contract-currency="formData.contractCurrency"
              :converted-amount="convertedAmount"
              :operate-allowed="canOperatePayments"
            >
              <template #project-progress>
                <a-form-item class="progress-field" label="当前阶段">
                  <a-select v-model="formData.deliveryStage" :disabled="!canUpdateProgress">
                    <a-option
                      v-for="item in STAGE_OPTIONS"
                      :key="item.value"
                      :value="item.value"
                      :label="localizeProjectStage(item.value, 'zh-CN')"
                    />
                  </a-select>
                </a-form-item>
                <a-form-item class="progress-field" label="项目进度（%）">
                  <a-input-number
                    v-model="formData.progressPercent"
                    :min="0"
                    :max="100"
                    :disabled="!canUpdateProgress"
                  >
                    <template #suffix>
                      %
                    </template>
                  </a-input-number>
                </a-form-item>
              </template>
            </ProjectPaymentPlan>
          </a-form>
        </a-spin>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.dialog-shell { height: min(608px, calc(100vh - 40px)); display: flex; flex-direction: column; overflow: hidden; background: #fff; color: #1d2129; }
.dialog-header { height: 48px; display: flex; flex: 0 0 48px; align-items: center; justify-content: space-between; padding: 0 16px 0 24px; border-bottom: 1px solid #e5e6eb; background: #fff; }
.dialog-header h2 { margin: 0; font-size: 16px; font-weight: 700; line-height: 24px; }
.dialog-actions { display: flex; align-items: center; gap: 12px; }
.dialog-actions :deep(.arco-btn) { height: 32px; padding: 0 16px; border-radius: 2px; }
.dialog-close { width: 54px; height: 32px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 100px; background: transparent; color: #165dff; cursor: pointer; }
.dialog-close:hover { background: #f2f3f5; }
.dialog-body { min-height: 0; flex: 1; overflow-x: hidden; overflow-y: auto; scrollbar-color: #c9cdd4 #f2f3f5; scrollbar-width: thin; }
.dialog-body :deep(.arco-spin), .dialog-body :deep(.arco-spin-mask) { width: 100%; }
.basic-section { padding: 20px 24px 0; }
.section-heading { height: 32px; border-bottom: 1px solid #e5e6eb; }
.section-heading h3 { margin: 0; color: #1d2129; font-size: 14px; font-weight: 700; line-height: 22px; }
.form-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; padding-top: 16px; }
.form-row-wide { grid-template-columns: minmax(260px, 1.33fr) repeat(2, minmax(190px, 1fr)); }
.project-detail-form :deep(.arco-form-item) { margin-bottom: 0; }
.project-detail-form :deep(.arco-form-item-label-col) { height: 20px; margin-bottom: 4px; color: #86909c; font-size: 12px; line-height: 20px; }
.project-detail-form :deep(.arco-form-item-label-required-symbol) { display: none; }
.project-detail-form :deep(.arco-input-wrapper),
.project-detail-form :deep(.arco-select-view),
.project-detail-form :deep(.arco-picker),
.project-detail-form :deep(.arco-input-number) { width: 100%; min-height: 32px; border: 0; border-radius: 0; background: #f2f3f5; box-shadow: none; color: #1d2129; }
.project-detail-form :deep(.arco-input-wrapper:not(.arco-input-disabled):hover),
.project-detail-form :deep(.arco-select-view:not(.arco-select-view-disabled):hover),
.project-detail-form :deep(.arco-picker:not(.arco-picker-disabled):hover),
.project-detail-form :deep(.arco-input-number:not(.arco-input-number-disabled):hover) { background: #e5e6eb; }
.project-detail-form :deep(.arco-input-disabled),
.project-detail-form :deep(.arco-select-view-disabled),
.project-detail-form :deep(.arco-picker-disabled),
.project-detail-form :deep(.arco-input-number-disabled) { background: #e5e6eb; color: #1d2129; opacity: 1; }
.project-detail-form :deep(.arco-input),
.project-detail-form :deep(.arco-select-view-value),
.project-detail-form :deep(.arco-picker input),
.project-detail-form :deep(.arco-input-number input) { font-size: 14px; line-height: 22px; }
.project-detail-form :deep(.arco-input::placeholder),
.project-detail-form :deep(.arco-select-view-placeholder),
.project-detail-form :deep(.arco-picker input::placeholder) { color: #86909c; opacity: 1; }
.project-detail-form :deep(.arco-select-view-multiple) { max-height: 32px; overflow: hidden; padding-block: 3px; }
.project-detail-form :deep(.arco-tag) { border-radius: 2px; }
.progress-field :deep(.arco-form-item-label-col) { line-height: 14px; }
.progress-field :deep(.arco-input-number) { width: 100%; }
@media (max-width: 900px) {
  .dialog-shell { height: calc(100vh - 24px); }
  .form-row, .form-row-wide { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .dialog-header { padding-left: 16px; }
  .basic-section { padding-inline: 16px; }
  .form-row, .form-row-wide { grid-template-columns: 1fr; gap: 12px; }
}
</style>

<style>
.project-detail-dialog .arco-modal {
  max-width: calc(100vw - 32px);
  overflow: hidden;
  border-radius: 0;
  box-shadow: 0 1px 4px rgb(0 0 0 / 4%), 0 4px 24px rgb(0 0 0 / 8%);
}
.project-detail-dialog .arco-modal-header { display: none; }
.project-detail-dialog .arco-modal-body { padding: 0; }
</style>
