<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FormInstance } from '@arco-design/web-vue'
import Message from '@arco-design/web-vue/es/message'
import Modal from '@arco-design/web-vue/es/modal'
import { IconClose, IconSave } from '@arco-design/web-vue/es/icon'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { projectApi } from '@/domains/project/api/project.api'
import { hasHttpStatus } from '@/api/errors'
import {
  useProjectDetailQuery,
  useProjectFormOptionsQueries,
  useProjectPaymentsQuery,
} from '@/domains/project/queries/useProjectQueries'
import { usePermission } from '@/composables/usePermission'
import { useFieldConfig } from '@/platform/field-configuration'
import { queryKeys } from '@/query/keys'
import type { ArchiveTemplate } from '@/domains/archive/types/archive'
import type { Currency } from '@/types/currency'
import type {
  ContractType,
  CreateProjectDto,
  CustomerType,
  ProductType,
  ProjectDeliveryStage,
  ProjectKeyword,
  ProjectUserReferenceOption,
  UpdateProjectDto,
} from '@/domains/project/types/project'
import type {
  ProjectPayment,
  ProjectPaymentPlanItem,
  ProjectPaymentPlanWriteItem,
} from '@/domains/project/types/project-payment'
import {
  formatMoneyString,
  isMoney,
  moneyToMinor,
  multiplyMoneyByRate,
  normalizeMoneyInput,
} from '@/utils/decimal-money'
import {
  projectDictionaryColor,
  type ProjectDictionaryKind,
} from '@/domains/project/adapters/project-dictionaries'
import ProjectPaymentPlan from './ProjectPaymentPlan.vue'

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
const acceptedAmountManuallyEdited = ref(false)
const isCreate = computed(() => props.mode === 'create')
const isView = computed(() => props.mode === 'view')
const projectId = computed(() => props.projectId || '')
const canViewPayments = computed(() => hasPermission('payment:view'))
const projectQuery = useProjectDetailQuery(projectId)
const paymentQuery = useProjectPaymentsQuery(projectId, computed(() =>
  props.visible && !isCreate.value && canViewPayments.value,
))
const optionQueries = useProjectFormOptionsQueries(true)
const fieldConfig = useFieldConfig('project')
const project = computed(() => projectQuery.data.value)
const readonly = computed(() => isView.value || (props.mode === 'edit' && project.value?.canEdit === false))
const renderView = computed(() => isView.value || readonly.value)
const canEditFinancial = computed(() => !readonly.value && hasAnyPermission(['project:view_financial']))
const canEditContract = computed(() => !readonly.value && hasAnyPermission(['project:view_contract']))
const canUpdateProgress = computed(() =>
  !readonly.value &&
  hasPermission('project:progress:update') &&
  (isCreate.value || project.value?.canUpdateProgress === true),
)
const canEditAcceptance = computed(() =>
  !readonly.value &&
  canUpdateProgress.value &&
  hasAnyPermission(['project:view_acceptance']),
)
const canEditAcceptanceDate = computed(() =>
  canUpdateProgress.value &&
  hasAnyPermission(['project:view_acceptance']) &&
  (isCreate.value || !project.value?.actualAcceptanceAt),
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
  countryCode: '',
  city: '',
  customerType: undefined as CustomerType | undefined,
  contractType: undefined as ContractType | undefined,
  product: undefined as ProductType | undefined,
  keywords: [] as ProjectKeyword[],
  contractCurrency: '',
  contractAmount: '',
  convertedAmount: '',
  acceptedConvertedAmount: '',
  archiveTemplateId: '',
  contractNo: '',
  contractSignedAt: '',
  startDate: '',
  expectedAcceptanceAt: '',
  salesOwnerId: '',
  projectManagerId: '',
  electricalOwnerId: '',
  softwareOwnerId: '',
  deliveryStages: [] as ProjectDeliveryStage[],
  progressPercent: 0,
  acceptanceCompleted: false,
})
const rules = computed(() => ({
  projectName: [{ required: true, message: '请输入合同名称' }],
  countryCode: [{ required: fieldConfig.isFieldRequired('COUNTRY'), message: '请选择国家' }],
  customerType: [{ required: fieldConfig.isFieldRequired('CUSTOMER_TYPE'), message: '请选择客户类型' }],
  contractType: [{ required: fieldConfig.isFieldRequired('CONTRACT_TYPE'), message: '请选择合同类型' }],
  product: [{ required: fieldConfig.isFieldRequired('PRODUCT_TYPE'), message: '请选择产品类型' }],
  keywords: [{ required: fieldConfig.isFieldRequired('PROJECT_KEYWORD'), message: '请选择项目关键词' }],
  contractCurrency: [{ required: fieldConfig.isFieldRequired('CURRENCY'), message: '请选择合同币种' }],
  archiveTemplateId: [{ required: true, message: '请选择档案模版' }],
  deliveryStages: [{
    required: fieldConfig.isFieldRequired('PROJECT_STAGE'),
    message: '请至少选择一个当前阶段',
  }],
  expectedAcceptanceAt: [{
    required: formData.acceptanceCompleted,
    message: '完成验收时请选择验收时间',
  }],
}))
const idempotencyKey = ref('')

function configuredOptions<T extends string>(
  fieldCode: string,
  kind: ProjectDictionaryKind,
  currentValues: Array<string | undefined>,
) {
  const historicalValues = new Set(currentValues.filter((value): value is string => Boolean(value)))
  return fieldConfig.getFieldOptions(fieldCode, true)
    .filter((item) => item.enabled || historicalValues.has(item.value))
    .map((item) => ({
      label: item.label,
      value: item.value as T,
      color: projectDictionaryColor(kind, item.value),
      disabled: !item.enabled,
    }))
}
function configuredSelectOptions(
  fieldCode: string,
  currentValue: string | undefined,
  formatLabel: (label: string, value: string) => string,
) {
  return fieldConfig.getFieldOptions(fieldCode, true)
    .filter((item) => item.enabled || item.value === currentValue)
    .map((item) => ({
      value: item.value,
      label: formatLabel(item.label, item.value),
      disabled: !item.enabled,
    }))
}
function configuredDefault(fieldCode: string): string {
  const defaultValue = String(fieldConfig.getField(fieldCode)?.defaultValue ?? '')
  return fieldConfig
    .getFieldOptions(fieldCode)
    .some((option) => option.value === defaultValue)
    ? defaultValue
    : ''
}
const countryOptions = computed(() =>
  configuredSelectOptions(
    'COUNTRY',
    formData.countryCode,
    (label, value) => `${label} (${value})`,
  ),
)
const currencies = computed<Currency[]>(() => optionQueries.value[0].data ?? [])
const currencyOptions = computed(() =>
  configuredSelectOptions(
    'CURRENCY',
    formData.contractCurrency,
    (label, value) => `${label} (${value})`,
  ),
)
const customerTypeOptions = computed(() =>
  configuredOptions<CustomerType>('CUSTOMER_TYPE', 'customerType', [formData.customerType]),
)
const contractTypeOptions = computed(() =>
  configuredOptions<ContractType>('CONTRACT_TYPE', 'contractType', [formData.contractType]),
)
const productTypeOptions = computed(() =>
  configuredOptions<ProductType>('PRODUCT_TYPE', 'productType', [formData.product]),
)
const keywordOptions = computed(() =>
  configuredOptions<ProjectKeyword>('PROJECT_KEYWORD', 'projectKeyword', formData.keywords),
)
const stageOptions = computed(() =>
  configuredOptions<ProjectDeliveryStage>(
    'PROJECT_STAGE',
    'projectType',
    formData.deliveryStages,
  ),
)
const salesOptions = computed<ProjectUserReferenceOption[]>(() => optionQueries.value[2].data ?? [])
const managerOptions = computed<ProjectUserReferenceOption[]>(() => optionQueries.value[3].data ?? [])
const memberOptions = computed<ProjectUserReferenceOption[]>(() => optionQueries.value[4].data ?? [])
const archiveOptions = computed(() =>
  ((optionQueries.value[5].data ?? []) as ArchiveTemplate[])
    .filter((item) => item.status === 'PUBLISHED' || item.id === formData.archiveTemplateId)
    .map((item) => ({ value: item.id, label: `${item.templateName} (${item.templateCode})` })),
)
const loading = computed(() =>
  fieldConfig.loading.value ||
  optionQueries.value.some((query) => query.isFetching) ||
  (!isCreate.value && projectQuery.isFetching.value) ||
  (!isCreate.value && canViewPayments.value && paymentQuery.isFetching.value),
)
const loadError = computed(() => {
  if (!isCreate.value && projectQuery.isError.value) return '项目详情加载失败'
  if (fieldConfig.error.value || optionQueries.value.some((query) => query.isError)) {
    return '项目字段配置加载失败'
  }
  if (!isCreate.value && canViewPayments.value && paymentQuery.isError.value) {
    return '款项计划加载失败'
  }
  return ''
})
const baseCurrencyCode = computed(() =>
  configuredDefault('CURRENCY'),
)
const baseCurrencyLabel = computed(
  () => fieldConfig.getFieldLabel('CURRENCY', baseCurrencyCode.value) || '折算币种',
)
const convertedAmount = computed(() => {
  if ((isView.value || !canEditFinancial.value) && formData.convertedAmount) {
    return formData.convertedAmount
  }
  if (!formData.contractAmount) return undefined
  if (formData.contractCurrency === baseCurrencyCode.value) return formData.contractAmount
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

function applyFieldDefaults(): void {
  if (!formData.countryCode) {
    formData.countryCode = configuredDefault('COUNTRY')
  }
  if (!formData.contractCurrency) {
    formData.contractCurrency = baseCurrencyCode.value
  }
  if (!formData.customerType) {
    formData.customerType = (configuredDefault('CUSTOMER_TYPE') as CustomerType) || undefined
  }
  if (!formData.contractType) {
    formData.contractType = (configuredDefault('CONTRACT_TYPE') as ContractType) || undefined
  }
  if (!formData.product) {
    formData.product = (configuredDefault('PRODUCT_TYPE') as ProductType) || undefined
  }
  if (formData.keywords.length === 0) {
    const defaultKeyword = configuredDefault('PROJECT_KEYWORD')
    formData.keywords = defaultKeyword ? [defaultKeyword as ProjectKeyword] : []
  }
  if (formData.deliveryStages.length === 0) {
    const defaultStage = configuredDefault('PROJECT_STAGE')
    formData.deliveryStages = defaultStage ? [defaultStage as ProjectDeliveryStage] : []
  }
}

function blankForm(): void {
  Object.assign(formData, {
    projectName: '',
    shortName: '',
    projectCode: '',
    customerName: '',
    countryCode: configuredDefault('COUNTRY'),
    city: '',
    customerType: (configuredDefault('CUSTOMER_TYPE') as CustomerType) || undefined,
    contractType: (configuredDefault('CONTRACT_TYPE') as ContractType) || undefined,
    product: (configuredDefault('PRODUCT_TYPE') as ProductType) || undefined,
    keywords: (() => {
      const defaultKeyword = configuredDefault('PROJECT_KEYWORD')
      return defaultKeyword ? [defaultKeyword as ProjectKeyword] : []
    })(),
    contractCurrency: baseCurrencyCode.value,
    contractAmount: '',
    convertedAmount: '',
    acceptedConvertedAmount: '',
    archiveTemplateId: '',
    contractNo: '',
    contractSignedAt: '',
    startDate: '',
    expectedAcceptanceAt: '',
    salesOwnerId: '',
    projectManagerId: '',
    electricalOwnerId: '',
    softwareOwnerId: '',
    deliveryStages: (() => {
      const defaultStage = configuredDefault('PROJECT_STAGE')
      return defaultStage ? [defaultStage as ProjectDeliveryStage] : []
    })(),
    progressPercent: 0,
    acceptanceCompleted: false,
  })
  applyFieldDefaults()
  payments.value = []
  acceptedAmountManuallyEdited.value = false
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
    customerType: value.customerType || undefined,
    contractType: value.contractType || undefined,
    product: value.product || undefined,
    keywords: value.keywords || [],
    contractCurrency:
      value.contractCurrency ||
      baseCurrencyCode.value,
    contractAmount: value.contractAmount ?? '',
    convertedAmount: value.convertedAmount ?? '',
    acceptedConvertedAmount: value.acceptedConvertedAmount ?? value.convertedAmount ?? '',
    archiveTemplateId: value.archiveTemplateId || '',
    contractNo: value.contractNo || '',
    contractSignedAt: value.contractSignedAt?.slice(0, 10) || '',
    startDate: value.startDate?.slice(0, 10) || '',
    expectedAcceptanceAt:
      value.actualAcceptanceAt?.slice(0, 10) ||
      value.expectedAcceptanceAt?.slice(0, 10) ||
      '',
    salesOwnerId: value.salesOwnerId || '',
    projectManagerId: value.projectManagerId || '',
    electricalOwnerId: value.electricalOwnerId || '',
    softwareOwnerId: value.softwareOwnerId || '',
    deliveryStages: value.currentStages?.length ? [...value.currentStages] : [value.currentStage],
    progressPercent: value.progressPercent ?? 0,
    acceptanceCompleted: Boolean(value.actualAcceptanceAt),
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
    receivedOriginalAmount: item.receivedOriginalAmount,
    receivedConvertedAmount: item.receivedConvertedAmount,
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
watch(
  () => fieldConfig.fields.value,
  () => {
    if (props.visible && isCreate.value) applyFieldDefaults()
  },
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
watch(convertedAmount, (value) => {
  if (!props.visible || !isCreate.value || acceptedAmountManuallyEdited.value) return
  formData.acceptedConvertedAmount = value ?? ''
})

function personLabel(option: ProjectUserReferenceOption): string {
  return option.displayName
}
function displayText(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return '—'
  return String(value)
}
function configuredLabel(fieldCode: string, value?: string | null): string {
  return displayText(fieldConfig.getFieldLabel(fieldCode, value))
}
function configuredCodeLabel(fieldCode: string, value?: string | null): string {
  if (!value) return '—'
  return `${fieldConfig.getFieldLabel(fieldCode, value)} (${value})`
}
function userReferenceLabel(
  value: string,
  options: ProjectUserReferenceOption[],
): string {
  if (!value) return '—'
  const option = options.find((item) => item.id === value)
  return option ? personLabel(option) : '—'
}
function archiveLabel(value: string): string {
  return archiveOptions.value.find((item) => item.value === value)?.label ?? displayText(value)
}
function dateLabel(value: string): string {
  return value ? value.slice(0, 10) : '—'
}
function moneyLabel(value?: string | null): string {
  return value ? formatMoneyString(value) : '—'
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
    convertedCurrency: baseCurrencyCode.value,
    receivedOriginalAmount: item.completed
      ? item.receivedOriginalAmount || item.originalAmount
      : '0',
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
    customerType: formData.customerType,
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
    payload.baseCurrency = baseCurrencyCode.value
    payload.contractAmount = formData.contractAmount || undefined
    payload.acceptedConvertedAmount = formData.acceptedConvertedAmount || undefined
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
async function save(): Promise<boolean> {
  if (readonly.value || mutation.isPending.value || !formRef.value) return false
  const validation = await formRef.value.validate().catch((error: unknown) => error)
  if (validation) return false
  if (formData.contractAmount && !isMoney(formData.contractAmount)) {
    Message.warning('请输入有效合同金额，最多保留两位小数')
    return false
  }
  if (formData.acceptedConvertedAmount && !isMoney(formData.acceptedConvertedAmount)) {
    Message.warning('请输入有效确收金额，最多保留两位小数')
    return false
  }
  if (!datesValid()) return false
  if (!paymentRatioValid.value) {
    Message.warning('款项计划付款比例合计必须为 100.00%')
    return false
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
          deliveryStages: formData.deliveryStages.length ? [...formData.deliveryStages] : undefined,
          progressPercent: formData.progressPercent,
          expectedAcceptanceAt: canEditAcceptanceDate.value
            ? formData.expectedAcceptanceAt || undefined
            : undefined,
          actualAcceptanceAt: canEditAcceptance.value && formData.acceptanceCompleted
            ? formData.expectedAcceptanceAt
            : undefined,
        },
      })
      savedProjectId = savedProject.id
    } else {
      if (!project.value) return false
      const progressPayload = canUpdateProgress.value
        ? {
            deliveryStages: [...formData.deliveryStages],
            progressPercent: formData.progressPercent,
            expectedAcceptanceAt: canEditAcceptanceDate.value
              ? formData.expectedAcceptanceAt || null
              : undefined,
            actualAcceptanceAt: canEditAcceptance.value
              ? formData.acceptanceCompleted
                ? formData.expectedAcceptanceAt
                : null
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
    return true
  } catch (error) {
    if (hasHttpStatus(error, 409)) {
      Message.warning('项目已被其他人修改，请刷新后重试')
      await projectQuery.refetch()
    }
    return false
  }
}
function updateContractAmount(value: string): void {
  formData.contractAmount = normalizeMoneyInput(value)
}
function updateAcceptedAmount(value: string): void {
  acceptedAmountManuallyEdited.value = true
  formData.acceptedConvertedAmount = normalizeMoneyInput(value)
}
function close(): void {
  if (!dirty.value) {
    emit('update:visible', false)
    return
  }
  Modal.confirm({
    simple: false,
    alignCenter: true,
    titleAlign: 'start',
    modalClass: 'business-confirm-dialog',
    title: '未保存修改',
    content: '当前修改尚未保存，请选择保存或放弃修改。',
    okText: '保存',
    cancelText: '放弃修改',
    closable: false,
    maskClosable: false,
    escToClose: false,
    onBeforeOk: async (done) => {
      done(await save())
    },
    onCancel: () => emit('update:visible', false),
  })
}
async function retryLoad(): Promise<void> {
  const requests: Array<Promise<unknown>> = [
    fieldConfig.refresh(),
    ...optionQueries.value.map((query) => query.refetch()),
  ]
  if (!isCreate.value) requests.push(projectQuery.refetch())
  if (!isCreate.value && canViewPayments.value) requests.push(paymentQuery.refetch())
  await Promise.allSettled(requests)
}
</script>

<template>
  <a-modal
    class="project-detail-dialog"
    :visible="visible"
    :width="1040"
    :footer="false"
    :closable="false"
    :mask-closable="false"
    :esc-to-close="false"
    :unmount-on-close="true"
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
            v-if="loadError"
            status="error"
            :title="loadError"
          >
            <template #extra>
              <a-button @click="retryLoad">
                重新加载
              </a-button>
            </template>
          </a-result>

          <div
            v-else-if="renderView"
            class="project-detail-view"
          >
            <section class="basic-section">
              <div class="section-heading">
                <h3>基础信息</h3>
              </div>

              <div class="form-row form-row-wide">
                <div class="view-field">
                  <span>合同名称</span>
                  <div :title="displayText(formData.projectName)">
                    {{ displayText(formData.projectName) }}
                  </div>
                </div>
                <div class="view-field">
                  <span>项目简称</span>
                  <div :title="displayText(formData.shortName)">
                    {{ displayText(formData.shortName) }}
                  </div>
                </div>
                <div class="view-field">
                  <span>项目编号</span>
                  <div :title="displayText(formData.projectCode)">
                    {{ displayText(formData.projectCode) }}
                  </div>
                </div>
              </div>

              <div class="form-row form-row-wide">
                <div class="view-field">
                  <span>客户名称</span>
                  <div :title="displayText(formData.customerName)">
                    {{ displayText(formData.customerName) }}
                  </div>
                </div>
                <div class="view-field">
                  <span>国家</span>
                  <div :title="configuredCodeLabel('COUNTRY', formData.countryCode)">
                    {{ configuredCodeLabel('COUNTRY', formData.countryCode) }}
                  </div>
                </div>
                <div class="view-field">
                  <span>城市</span>
                  <div :title="displayText(formData.city)">
                    {{ displayText(formData.city) }}
                  </div>
                </div>
              </div>

              <div class="form-row">
                <div class="view-field">
                  <span>客户类型</span>
                  <div :title="configuredLabel('CUSTOMER_TYPE', formData.customerType)">
                    {{ configuredLabel('CUSTOMER_TYPE', formData.customerType) }}
                  </div>
                </div>
                <div class="view-field">
                  <span>合同类型</span>
                  <div :title="configuredLabel('CONTRACT_TYPE', formData.contractType)">
                    {{ configuredLabel('CONTRACT_TYPE', formData.contractType) }}
                  </div>
                </div>
                <div class="view-field">
                  <span>产品类型</span>
                  <div :title="configuredLabel('PRODUCT_TYPE', formData.product)">
                    {{ configuredLabel('PRODUCT_TYPE', formData.product) }}
                  </div>
                </div>
                <div class="view-field">
                  <span>项目关键词</span>
                  <div class="view-tags">
                    <a-tag
                      v-for="keyword in formData.keywords"
                      :key="keyword"
                      size="small"
                    >
                      {{ configuredLabel('PROJECT_KEYWORD', keyword) }}
                    </a-tag>
                    <template v-if="formData.keywords.length === 0">
                      —
                    </template>
                  </div>
                </div>
              </div>

              <div class="form-row">
                <div class="view-field">
                  <span>合同币种</span>
                  <div :title="configuredCodeLabel('CURRENCY', formData.contractCurrency)">
                    {{ configuredCodeLabel('CURRENCY', formData.contractCurrency) }}
                  </div>
                </div>
                <div class="view-field">
                  <span>合同金额</span>
                  <div :title="moneyLabel(formData.contractAmount)">
                    {{ moneyLabel(formData.contractAmount) }}
                  </div>
                </div>
                <div class="view-field">
                  <span>折算{{ baseCurrencyLabel }}金额</span>
                  <div :title="moneyLabel(convertedAmount)">
                    {{ moneyLabel(convertedAmount) }}
                  </div>
                </div>
                <div class="view-field">
                  <span>档案模版</span>
                  <div :title="archiveLabel(formData.archiveTemplateId)">
                    {{ archiveLabel(formData.archiveTemplateId) }}
                  </div>
                </div>
              </div>

              <div class="form-row">
                <div class="view-field">
                  <span>合同编号</span>
                  <div :title="displayText(formData.contractNo)">
                    {{ displayText(formData.contractNo) }}
                  </div>
                </div>
                <div class="view-field">
                  <span>签约时间</span>
                  <div>{{ dateLabel(formData.contractSignedAt) }}</div>
                </div>
                <div class="view-field">
                  <span>开始时间</span>
                  <div>{{ dateLabel(formData.startDate) }}</div>
                </div>
                <div class="view-field">
                  <span>验收时间</span>
                  <div>{{ dateLabel(formData.expectedAcceptanceAt) }}</div>
                </div>
              </div>

              <div class="form-row">
                <div class="view-field">
                  <span>销售负责人</span>
                  <div :title="userReferenceLabel(formData.salesOwnerId, salesOptions)">
                    {{ userReferenceLabel(formData.salesOwnerId, salesOptions) }}
                  </div>
                </div>
                <div class="view-field">
                  <span>项目经理</span>
                  <div :title="userReferenceLabel(formData.projectManagerId, managerOptions)">
                    {{ userReferenceLabel(formData.projectManagerId, managerOptions) }}
                  </div>
                </div>
                <div class="view-field">
                  <span>电气工程师</span>
                  <div :title="userReferenceLabel(formData.electricalOwnerId, memberOptions)">
                    {{ userReferenceLabel(formData.electricalOwnerId, memberOptions) }}
                  </div>
                </div>
                <div class="view-field">
                  <span>软件工程师</span>
                  <div :title="userReferenceLabel(formData.softwareOwnerId, memberOptions)">
                    {{ userReferenceLabel(formData.softwareOwnerId, memberOptions) }}
                  </div>
                </div>
              </div>

              <div class="form-row form-row-compact">
                <div class="view-field">
                  <span>当前阶段</span>
                  <div class="view-tags">
                    <a-tag
                      v-for="stage in formData.deliveryStages"
                      :key="stage"
                      size="small"
                    >
                      {{ configuredLabel('PROJECT_STAGE', stage) }}
                    </a-tag>
                    <template v-if="formData.deliveryStages.length === 0">
                      —
                    </template>
                  </div>
                </div>
                <div class="view-field">
                  <span>项目进度（%）</span>
                  <div>{{ formData.progressPercent }}%</div>
                </div>
                <div class="view-field">
                  <span>确收金额（{{ baseCurrencyLabel }}）</span>
                  <div>{{ moneyLabel(formData.acceptedConvertedAmount) }}</div>
                </div>
                <div class="view-field">
                  <span>是否完成验收</span>
                  <div>{{ formData.acceptanceCompleted ? '是' : '否' }}</div>
                </div>
              </div>
            </section>

            <ProjectPaymentPlan
              :model-value="payments"
              readonly
              :loading="paymentQuery.isFetching.value"
              :contract-amount="formData.contractAmount"
              :contract-currency="formData.contractCurrency"
              :base-currency="baseCurrencyCode"
              :base-currency-label="baseCurrencyLabel"
              :converted-amount="convertedAmount"
              :operate-allowed="false"
            />
          </div>

          <a-form
            v-else
            ref="formRef"
            :model="formData"
            :rules="rules"
            layout="vertical"
            class="project-detail-form"
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
                <a-form-item label="客户类型" field="customerType">
                  <a-select v-model="formData.customerType">
                    <a-option v-for="item in customerTypeOptions" :key="item.value" v-bind="item" />
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
                <a-form-item label="项目关键词" field="keywords">
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
                <a-form-item label="合同币种" field="contractCurrency">
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
                <a-form-item :label="`折算${baseCurrencyLabel}金额`">
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
                  <a-date-picker v-model="formData.expectedAcceptanceAt" format="YYYY-MM-DD" :disabled="!canEditAcceptanceDate" />
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

              <div class="form-row form-row-compact">
                <a-form-item label="当前阶段" field="deliveryStages">
                  <a-select
                    v-model="formData.deliveryStages"
                    multiple
                    allow-clear
                    :disabled="!canUpdateProgress"
                  >
                    <a-option
                      v-for="item in stageOptions"
                      :key="item.value"
                      v-bind="item"
                    />
                  </a-select>
                </a-form-item>
                <a-form-item label="项目进度（%）">
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
                <a-form-item :label="`确收金额（${baseCurrencyLabel}）`">
                  <a-input
                    :model-value="formData.acceptedConvertedAmount"
                    placeholder="默认带入合同折算金额"
                    :disabled="!canEditFinancial"
                    @input="updateAcceptedAmount"
                  />
                </a-form-item>
                <a-form-item class="acceptance-field" label="是否完成验收">
                  <a-select
                    v-model="formData.acceptanceCompleted"
                    :disabled="!canEditAcceptance"
                  >
                    <a-option :value="false" label="否" />
                    <a-option :value="true" label="是" />
                  </a-select>
                </a-form-item>
              </div>
            </section>

            <ProjectPaymentPlan
              v-model="payments"
              :readonly="false"
              :loading="paymentQuery.isFetching.value"
              :contract-amount="formData.contractAmount"
              :contract-currency="formData.contractCurrency"
              :base-currency="baseCurrencyCode"
              :base-currency-label="baseCurrencyLabel"
              :converted-amount="convertedAmount"
              :operate-allowed="canOperatePayments"
            />
          </a-form>
        </a-spin>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.dialog-shell { height: min(760px, calc(100vh - 32px)); display: flex; flex-direction: column; overflow: hidden; background: #fff; color: #1d2129; }
.dialog-header { height: 48px; display: flex; flex: 0 0 48px; align-items: center; justify-content: space-between; padding: 0 16px 0 24px; border-bottom: 1px solid #e5e6eb; background: #fff; }
.dialog-header h2 { margin: 0; font-size: 16px; font-weight: 700; line-height: 24px; }
.dialog-actions { display: flex; align-items: center; gap: 12px; }
.dialog-actions :deep(.arco-btn) { width: 82px; height: 32px; padding: 0; border-radius: 0; }
.dialog-close { width: 54px; height: 32px; display: inline-flex; align-items: center; justify-content: center; padding: 0 16px; border: 0; border-radius: 0; background: transparent; color: #165dff; cursor: pointer; }
.dialog-close:hover { background: #f2f3f5; }
.dialog-body { min-height: 0; flex: 1; overflow-x: hidden; overflow-y: scroll; scrollbar-color: #c9cdd4 #f2f3f5; scrollbar-width: thin; scrollbar-gutter: stable; }
.dialog-body::-webkit-scrollbar { width: 4px; height: 4px; }
.dialog-body::-webkit-scrollbar-track { background: #f2f3f5; }
.dialog-body::-webkit-scrollbar-thumb { border-radius: 2px; background: #c9cdd4; }
.dialog-body :deep(.arco-spin) { width: 100%; min-height: 100%; }
.dialog-body :deep(.arco-spin-mask) { width: 100%; }
.project-detail-form,
.project-detail-view { width: min(1021px, calc(100% - 10px)); margin-left: 9px; }
.basic-section { padding: 20px 24px 0; }
.section-heading { height: 32px; border-bottom: 1px solid #e5e6eb; }
.section-heading h3 { margin: 0; color: #1d2129; font-size: 14px; font-weight: 700; line-height: 22px; }
.form-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; padding-top: 16px; }
.form-row-wide { grid-template-columns: minmax(0, 427fr) minmax(0, 249fr) minmax(0, 249fr); }
.project-detail-form :deep(.arco-form-item) { margin-bottom: 0; }
.project-detail-form :deep(.arco-form-item-label-col) { height: 20px; margin-bottom: 4px; color: #86909c; font-size: 12px; line-height: 20px; }
.project-detail-form .form-row-compact :deep(.arco-form-item-label-col) { height: 14px; margin-bottom: 4px; line-height: 14px; }
.project-detail-form :deep(.arco-form-item-label-required-symbol) { display: none; }
.project-detail-form :deep(.arco-input-wrapper),
.project-detail-form :deep(.arco-select-view),
.project-detail-form :deep(.arco-picker),
.project-detail-form :deep(.arco-input-number) { width: 100%; min-height: 32px; border: 0; border-radius: 0; background: #e5e6eb; box-shadow: none; color: #1d2129; }
.project-detail-form :deep(.arco-input-wrapper:not(.arco-input-disabled):hover),
.project-detail-form :deep(.arco-select-view:not(.arco-select-view-disabled):hover),
.project-detail-form :deep(.arco-picker:not(.arco-picker-disabled):hover),
.project-detail-form :deep(.arco-input-number:not(.arco-input-number-disabled):hover) { background: #c9cdd4; }
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
.project-detail-form :deep(.arco-tag) { border-radius: 0; }
.acceptance-field :deep(.arco-select-view:not(.arco-select-view-disabled)) { border: 1px solid #e5e6eb; background: #fff; }
.view-field { min-width: 0; }
.view-field > span { display: block; height: 20px; margin-bottom: 4px; overflow: hidden; color: #86909c; font-size: 12px; line-height: 20px; text-overflow: ellipsis; white-space: nowrap; }
.form-row-compact .view-field > span { height: 14px; line-height: 14px; }
.view-field > div { width: 100%; height: 32px; padding: 5px 12px; overflow: hidden; background: #e5e6eb; color: #1d2129; font-size: 14px; line-height: 22px; text-overflow: ellipsis; white-space: nowrap; }
.view-field > .view-tags { display: flex; align-items: center; gap: 4px; }
.view-tags :deep(.arco-tag) { flex: 0 0 auto; max-width: 100%; overflow: hidden; border-radius: 0; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 800px) {
  .dialog-shell { height: calc(100vh - 24px); }
  .form-row, .form-row-wide { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .dialog-header { padding-left: 16px; }
  .project-detail-form,
  .project-detail-view { width: 100%; margin-left: 0; }
  .basic-section { padding-inline: 16px; }
  .form-row, .form-row-wide { grid-template-columns: 1fr; gap: 12px; }
}
</style>

<style>
.project-detail-dialog .arco-modal-wrapper {
  overflow: hidden;
}
.project-detail-dialog .arco-modal {
  max-width: calc(100vw - 32px);
  overflow: hidden;
  border-radius: 0;
  box-shadow: 0 1px 4px rgb(0 0 0 / 4%), 0 4px 24px rgb(0 0 0 / 8%);
}
.project-detail-dialog .arco-modal-header { display: none; }
.project-detail-dialog .arco-modal-body { padding: 0; }
</style>
