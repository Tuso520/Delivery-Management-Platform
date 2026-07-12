<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Message } from '@arco-design/web-vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { projectApi } from '@/api/project'
import { hasHttpStatus } from '@/api/errors'
import { projectPaymentApi } from '@/api/project-payment'
import {
  BusinessModal,
  BusinessTable,
  Can,
  PageContainer,
  PageToolbar,
  SectionCard,
  StatusBadge,
} from '@/components/business'
import {
  useProjectDetailQuery,
  useProjectPaymentsQuery,
  useProjectUserOptionsQuery,
} from '@/composables/queries/useProjectQueries'
import { usePermission } from '@/composables/usePermission'
import { queryKeys } from '@/query/keys'
import { useLocaleStore } from '@/store/locale'
import type {
  Project,
  ProjectDeliveryStage,
  ProjectLifecycleStatus,
  ProjectMember,
  ProjectStatusCommand,
  ProjectUserReferenceOption,
} from '@/types/project'
import { PROJECT_DELIVERY_STAGES, PROJECT_ROLE_OPTIONS, STAGE_OPTIONS } from '@/types/project'
import type { ProjectPayment, ProjectPaymentPayload } from '@/types/project-payment'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import {
  localizeProjectRisk,
  localizeProjectStage,
  localizeProjectStatus,
} from '@/utils/project-localization'

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
  edit: []
  close: []
  changed: []
}>()

const route = useRoute()
const router = useRouter()
const localeStore = useLocaleStore()
const { hasPermission, hasAllPermissions } = usePermission()
const queryClient = useQueryClient()
const { t } = useI18n()
const resolvedProjectId = computed(
  () =>
    props.projectId ||
    String(route.params.projectId || route.params.id || route.query.projectId || ''),
)

const memberModalVisible = ref(false)
const memberForm = ref({ userId: '', projectRole: 'MEMBER' })
const paymentModalVisible = ref(false)
const editingPaymentId = ref('')
const stageModalVisible = ref(false)
const stageForm = ref<{ targetStage: ProjectDeliveryStage; reason: string }>({
  targetStage: 'STARTUP',
  reason: '',
})
const acceptanceModalVisible = ref(false)
const acceptanceForm = ref({
  expectedAcceptanceAt: '',
  actualAcceptanceAt: '',
  reason: '',
})
const paymentForm = ref<ProjectPaymentPayload>({
  projectId: resolvedProjectId.value,
  paymentName: '',
  originalAmount: 0,
  originalCurrency: 'CNY',
  convertedCurrency: 'CNY',
  receivedOriginalAmount: 0,
  dueDate: '',
  receivedDate: '',
  remark: '',
})

const projectQuery = useProjectDetailQuery(resolvedProjectId)
const paymentQuery = useProjectPaymentsQuery(
  resolvedProjectId,
  computed(() => hasPermission('payment:view')),
)
const userOptionsQuery = useProjectUserOptionsQuery('project-member')
const project = computed<Project | null>(() => projectQuery.data.value ?? null)
const memberList = computed<ProjectMember[]>(() => project.value?.members ?? [])
const paymentList = computed<ProjectPayment[]>(() => paymentQuery.data.value?.items ?? [])
const userOptions = computed<ProjectUserReferenceOption[]>(() => userOptionsQuery.data.value ?? [])
const loading = computed(() => projectQuery.isFetching.value || paymentQuery.isFetching.value)
const loadError = computed(() => projectQuery.isError.value)

type ProjectDetailMutation =
  | { kind: 'remove-member'; memberId: string }
  | { kind: 'add-member'; userId: string; projectRole: string }
  | { kind: 'stage'; revision: number; targetStage: ProjectDeliveryStage; reason?: string }
  | { kind: 'status'; revision: number; command: ProjectStatusCommand; reason?: string }
  | {
      kind: 'acceptance'
      revision: number
      expectedAcceptanceAt?: string
      actualAcceptanceAt?: string
      reason?: string
    }
  | { kind: 'payment'; paymentId?: string; data: ProjectPaymentPayload }

const projectDetailMutation = useMutation({
  mutationFn: async (variables: ProjectDetailMutation) => {
    const projectId = resolvedProjectId.value
    switch (variables.kind) {
      case 'remove-member':
        return projectApi.removeMember(projectId, variables.memberId)
      case 'add-member':
        return projectApi.addMember(projectId, {
          userId: variables.userId,
          projectRole: variables.projectRole,
        })
      case 'stage':
        return projectApi.updateStage(projectId, {
          revision: variables.revision,
          targetStage: variables.targetStage,
          reason: variables.reason,
        })
      case 'status':
        return projectApi.changeStatus(projectId, variables.command, {
          revision: variables.revision,
          reason: variables.reason,
        })
      case 'acceptance':
        return projectApi.updateAcceptance(projectId, {
          revision: variables.revision,
          expectedAcceptanceAt: variables.expectedAcceptanceAt,
          actualAcceptanceAt: variables.actualAcceptanceAt,
          reason: variables.reason,
        })
      case 'payment':
        return variables.paymentId
          ? projectPaymentApi.update(variables.paymentId, variables.data)
          : projectPaymentApi.create(variables.data)
    }
  },
  retry: false,
  onSuccess: async (result, variables) => {
    const projectId = resolvedProjectId.value
    if (['stage', 'status', 'acceptance'].includes(variables.kind)) {
      queryClient.setQueryData(queryKeys.projects.detail(projectId), result as Project)
    }
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() }),
    ]
    if (variables.kind === 'status') {
      invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.projects.summary() }))
    }
    if (variables.kind === 'payment') {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.payments(projectId) }),
      )
    }
    await Promise.all(invalidations)
  },
})
const commandLoading = computed(() => projectDetailMutation.isPending.value)

const isArchived = computed(() => Boolean(project.value?.archivedAt))

const lifecycleStatus = computed<ProjectLifecycleStatus>(() => {
  return project.value?.status ?? 'DRAFT'
})

const statusActions = computed<
  Array<{
    command: ProjectStatusCommand
    label: string
    status?: 'normal' | 'warning' | 'danger'
  }>
>(() => {
  if (isArchived.value) {
    return hasPermission('project:restore')
      ? [{ command: 'restore', label: t('projects.actions.restore'), status: 'normal' }]
      : []
  }
  if (!hasPermission('project:update')) return []

  const actions: Record<
    ProjectLifecycleStatus,
    Array<{
      command: ProjectStatusCommand
      label: string
      status?: 'normal' | 'warning' | 'danger'
    }>
  > = {
    DRAFT: [{ command: 'cancel', label: t('projects.actions.cancel'), status: 'danger' }],
    ACTIVE: [
      { command: 'pause', label: t('projects.actions.pause'), status: 'warning' },
      { command: 'complete', label: t('projects.actions.complete'), status: 'normal' },
      { command: 'cancel', label: t('projects.actions.cancel'), status: 'danger' },
    ],
    PAUSED: [
      { command: 'resume', label: t('projects.actions.resume'), status: 'normal' },
      { command: 'complete', label: t('projects.actions.complete'), status: 'normal' },
      { command: 'cancel', label: t('projects.actions.cancel'), status: 'danger' },
    ],
    COMPLETED: [],
    CANCELLED: [],
  }
  const result = [...actions[lifecycleStatus.value]]
  if (hasPermission('project:archive')) {
    result.push({ command: 'archive', label: t('projects.actions.archive'), status: 'warning' })
  }
  return result
})

async function refreshProject(): Promise<void> {
  await Promise.allSettled([projectQuery.refetch(), paymentQuery.refetch()])
}

function currentProjectRevision(): number {
  const revision = project.value?.revision
  if (!revision) throw new Error('Project revision is unavailable')
  return revision
}

async function handleProjectConflict(error: unknown): Promise<void> {
  if (!hasHttpStatus(error, 409)) return
  Message.warning(t('projects.conflict'))
  await Promise.all([
    refreshProject(),
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() }),
  ])
  emit('changed')
}

function handleEdit(): void {
  if (props.embedded) emit('edit')
  else void router.push(`/projects/${resolvedProjectId.value}/edit`)
}

function handleClose(): void {
  if (props.embedded) emit('close')
  else void router.push('/projects')
}

async function handleRemoveMember(member: ProjectMember): Promise<void> {
  try {
    await arcoConfirm(
      t('projects.removeMemberConfirm', {
        name: member.user?.realName || member.userId,
      }),
      t('projects.removeMemberTitle'),
      {
        type: 'warning',
      },
    )
    await projectDetailMutation.mutateAsync({ kind: 'remove-member', memberId: member.id })
    Message.success(t('projects.memberRemoved'))
    emit('changed')
  } catch {
    // Cancellation and request failures use the shared interaction layer.
  }
}

async function openAddMember(): Promise<void> {
  memberForm.value = { userId: '', projectRole: 'MEMBER' }
  memberModalVisible.value = true
  if (!userOptionsQuery.data.value) await userOptionsQuery.refetch()
}

async function handleAddMember(): Promise<boolean> {
  if (!memberForm.value.userId) {
    Message.warning(t('projects.memberRequired'))
    return false
  }
  try {
    await projectDetailMutation.mutateAsync({
      kind: 'add-member',
      ...memberForm.value,
    })
    Message.success(t('projects.memberAdded'))
    emit('changed')
    return true
  } catch {
    return false
  }
}

function openStageCommand(): void {
  const current = resolveDeliveryStage(project.value)
  stageForm.value = { targetStage: current || 'STARTUP', reason: '' }
  stageModalVisible.value = true
}

async function saveStage(): Promise<boolean> {
  const current = resolveDeliveryStage(project.value)
  const currentIndex = current ? PROJECT_DELIVERY_STAGES.indexOf(current) : -1
  const targetIndex = PROJECT_DELIVERY_STAGES.indexOf(stageForm.value.targetStage)
  if (currentIndex >= 0 && targetIndex < currentIndex && !stageForm.value.reason.trim()) {
    Message.warning(t('projects.stageRollbackRequired'))
    return false
  }

  try {
    await projectDetailMutation.mutateAsync({
      kind: 'stage',
      revision: currentProjectRevision(),
      targetStage: stageForm.value.targetStage,
      reason: stageForm.value.reason.trim() || undefined,
    })
    stageModalVisible.value = false
    Message.success(t('projects.stageUpdated'))
    emit('changed')
    return true
  } catch (error) {
    await handleProjectConflict(error)
    return false
  }
}

async function executeStatusCommand(command: ProjectStatusCommand, label: string): Promise<void> {
  try {
    let reason: string | undefined
    if (command === 'archive' || command === 'restore') {
      await arcoConfirm(t('projects.actionConfirm', { label }), label, {
        type: command === 'archive' ? 'warning' : 'info',
      })
    } else {
      const prompt = await arcoPrompt(t('projects.actionReasonHint'), label, {
        inputType: 'textarea',
        inputPlaceholder: t('projects.actionReasonPlaceholder'),
      })
      reason = prompt.value.trim() || undefined
    }

    await projectDetailMutation.mutateAsync({
      kind: 'status',
      revision: currentProjectRevision(),
      command,
      reason,
    })
    Message.success(t('projects.actionSuccess', { label }))
    emit('changed')
  } catch (error) {
    await handleProjectConflict(error)
  }
}

function openAcceptanceCommand(): void {
  acceptanceForm.value = {
    expectedAcceptanceAt: project.value?.expectedAcceptanceAt?.slice(0, 10) || '',
    actualAcceptanceAt: project.value?.actualAcceptanceAt?.slice(0, 10) || '',
    reason: '',
  }
  acceptanceModalVisible.value = true
}

async function saveAcceptance(): Promise<boolean> {
  if (!acceptanceForm.value.expectedAcceptanceAt && !acceptanceForm.value.actualAcceptanceAt) {
    Message.warning(t('projects.acceptanceRequired'))
    return false
  }
  try {
    await projectDetailMutation.mutateAsync({
      kind: 'acceptance',
      revision: currentProjectRevision(),
      expectedAcceptanceAt: acceptanceForm.value.expectedAcceptanceAt || undefined,
      actualAcceptanceAt: acceptanceForm.value.actualAcceptanceAt || undefined,
      reason: acceptanceForm.value.reason.trim() || undefined,
    })
    acceptanceModalVisible.value = false
    Message.success(t('projects.acceptanceUpdated'))
    emit('changed')
    return true
  } catch (error) {
    await handleProjectConflict(error)
    return false
  }
}

function paymentStatusLabel(status: string): string {
  return ['Planned', 'Invoiced', 'PartiallyReceived', 'Received', 'Overdue'].includes(status)
    ? t(`projects.paymentStatus.${status}`)
    : status
}

function openPayment(payment?: ProjectPayment): void {
  editingPaymentId.value = payment?.id ?? ''
  paymentForm.value = payment
    ? {
        projectId: resolvedProjectId.value,
        paymentName: payment.paymentName,
        paymentType: payment.paymentType,
        dueDate: payment.dueDate?.slice(0, 10) ?? '',
        originalAmount: payment.originalAmount,
        originalCurrency: payment.originalCurrency,
        convertedCurrency: payment.convertedCurrency,
        receivedOriginalAmount: payment.receivedOriginalAmount,
        receivedDate: payment.receivedDate?.slice(0, 10) ?? '',
        remark: payment.remark ?? '',
      }
    : {
        projectId: resolvedProjectId.value,
        paymentName: '',
        originalAmount: 0,
        originalCurrency: project.value?.contractCurrency || 'CNY',
        convertedCurrency: project.value?.baseCurrency || 'CNY',
        receivedOriginalAmount: 0,
        dueDate: '',
        receivedDate: '',
        remark: '',
      }
  paymentModalVisible.value = true
}

async function savePayment(): Promise<boolean> {
  if (!paymentForm.value.paymentName || paymentForm.value.originalAmount <= 0) {
    Message.warning(t('projects.paymentRequired'))
    return false
  }
  try {
    await projectDetailMutation.mutateAsync({
      kind: 'payment',
      paymentId: editingPaymentId.value || undefined,
      data: paymentForm.value,
    })
    Message.success(t('projects.paymentSaved'))
    return true
  } catch {
    return false
  }
}

function resolveDeliveryStage(value: Project | null): ProjectDeliveryStage | null {
  return value?.currentStage ?? null
}

function getCountryLabel(project: Project): string {
  return project.countryName || project.countryCode
}

function projectRoleLabel(role: string): string {
  const option = PROJECT_ROLE_OPTIONS.find((item) => item.value === role)
  return option ? t(option.label) : role
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(localeStore.currentLocale)
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(localeStore.currentLocale)
}

function formatAmount(value?: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat(localeStore.currentLocale, { maximumFractionDigits: 2 }).format(
    value,
  )
}

function referenceLabel(option: ProjectUserReferenceOption): string {
  return option.departmentName
    ? `${option.displayName} (${option.name}) · ${option.departmentName}`
    : `${option.displayName} (${option.name})`
}
</script>

<template>
  <PageContainer class="project-detail-page" :class="{ embedded }">
    <PageToolbar
      :title="embedded ? '' : project?.projectName || t('projects.detail')"
      :description="embedded ? '' : project?.projectCode || ''"
    >
      <template #actions>
        <a-button v-if="!embedded" @click="handleClose">
          {{ t('projects.detailPage.back') }}
        </a-button>
        <a-button
          v-if="project && hasPermission('project:stage:update') && !isArchived"
          @click="openStageCommand"
        >
          {{ t('projects.detailPage.adjustStage') }}
        </a-button>
        <a-button
          v-if="
            project &&
              hasAllPermissions(['project:update', 'project:view_acceptance']) &&
              !isArchived
          "
          @click="openAcceptanceCommand"
        >
          {{ t('projects.detailPage.updateAcceptance') }}
        </a-button>
        <a-button
          v-for="action in statusActions"
          :key="action.command"
          :status="action.status"
          :loading="commandLoading"
          @click="executeStatusCommand(action.command, action.label)"
        >
          {{ action.label }}
        </a-button>
        <Can v-if="project && !isArchived" permission="project:update">
          <a-button type="primary" @click="handleEdit">
            {{ t('common.edit') }}
          </a-button>
        </Can>
      </template>
    </PageToolbar>

    <a-spin :loading="loading" class="detail-loading">
      <a-result v-if="loadError" status="error" :title="t('projects.detailPage.loadFailed')">
        <template #subtitle>
          {{ t('projects.detailPage.loadFailedHint') }}
        </template>
        <template #extra>
          <a-button type="primary" @click="refreshProject">
            {{ t('common.retry') }}
          </a-button>
        </template>
      </a-result>

      <template v-else-if="project">
        <SectionCard :bordered="false" class="detail-card">
          <template #title>
            <div class="card-title-row">
              <span>{{ project.projectName }}</span>
              <StatusBadge
                domain="project"
                :status="isArchived ? 'ARCHIVED' : lifecycleStatus"
                :label="
                  isArchived
                    ? t('projects.archived')
                    : localizeProjectStatus(lifecycleStatus, localeStore.currentLocale)
                "
              />
            </div>
          </template>

          <a-descriptions :column="3" bordered size="small">
            <a-descriptions-item :label="t('projects.detailPage.projectCode')">
              {{
                project.projectCode
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.shortName')">
              {{
                project.shortName || '—'
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.region')">
              {{ getCountryLabel(project) }} / {{ project.city || '—' }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.customer')">
              {{
                project.customerName || '—'
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.projectType')">
              {{
                project.projectType || '—'
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.language')">
              {{
                project.projectLanguage || '—'
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.currentStage')">
              {{ localizeProjectStage(project.currentStage, localeStore.currentLocale) }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.progress')">
              {{ project.progressPercent == null ? '—' : `${project.progressPercent}%` }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.riskLevel')">
              <StatusBadge
                domain="risk"
                :status="project.riskLevel"
                :label="localizeProjectRisk(project.riskLevel, localeStore.currentLocale)"
              />
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.riskDescription')" :span="3">
              {{ project.riskDescription || '—' }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.plannedStart')">
              {{
                formatDate(project.startDate)
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.plannedEnd')">
              {{
                formatDate(project.plannedEndDate)
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.acceptanceTime')">
              <template v-if="project.acceptanceTimeType === 'ACTUAL'">
                {{
                  t('projects.detailPage.actualAcceptance', {
                    date: formatDate(project.actualAcceptanceAt),
                  })
                }}
              </template>
              <template v-else-if="project.acceptanceTimeType === 'EXPECTED'">
                {{
                  t('projects.detailPage.expectedAcceptance', {
                    date: formatDate(project.expectedAcceptanceAt),
                  })
                }}
              </template>
              <template v-else-if="project.acceptanceTimeType === 'NONE'">
                —
              </template>
              <template v-else>
                —
              </template>
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.contractNo')">
              {{
                project.contractNo || '—'
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.signedAt')">
              {{
                formatDate(project.contractSignedAt)
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.contractAmount')">
              <template v-if="project.contractAmount != null && project.contractCurrency">
                {{ project.contractCurrency }} {{ formatAmount(project.contractAmount) }}
              </template>
              <template v-else>
                —
              </template>
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.convertedAmount')">
              <template v-if="project.convertedAmount != null && project.baseCurrency">
                {{ project.baseCurrency }} {{ formatAmount(project.convertedAmount) }}
              </template>
              <template v-else>
                —
              </template>
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.rate')">
              {{ project.exchangeRate == null ? '—' : project.exchangeRate }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('projects.detailPage.rateDate')">
              {{
                formatDate(project.exchangeRateDate)
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('common.createdAt')">
              {{
                formatDateTime(project.createdAt)
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('common.updatedAt')">
              {{
                formatDateTime(project.updatedAt)
              }}
            </a-descriptions-item>
          </a-descriptions>
        </SectionCard>

        <SectionCard :bordered="false" class="detail-card">
          <template #title>
            {{
              t('projects.detailPage.members', { count: memberList.length })
            }}
          </template>
          <template #extra>
            <a-button
              v-if="hasPermission('project:manage_member')"
              type="primary"
              size="small"
              @click="openAddMember"
            >
              {{ t('projects.detailPage.addMember') }}
            </a-button>
          </template>
          <BusinessTable
            :data="memberList"
            bordered
            stripe
            size="small"
            :empty-title="t('projects.detailPage.emptyMembers')"
          >
            <a-table-column :title="t('projects.detailPage.name')" :min-width="120">
              <template #cell="{ record: row }">
                {{ row.user?.realName || '—' }}
              </template>
            </a-table-column>
            <a-table-column :title="t('projects.detailPage.username')" :width="120">
              <template #cell="{ record: row }">
                {{ row.user?.username || '—' }}
              </template>
            </a-table-column>
            <a-table-column
              data-index="projectRole"
              :title="t('projects.detailPage.projectRole')"
              :width="140"
            >
              <template #cell="{ record: row }">
                {{ projectRoleLabel(row.projectRole) }}
              </template>
            </a-table-column>
            <a-table-column
              v-if="hasPermission('project:manage_member')"
              :title="t('common.action')"
              :width="90"
            >
              <template #cell="{ record: row }">
                <a-button
                  type="text"
                  status="danger"
                  size="small"
                  @click="handleRemoveMember(row)"
                >
                  {{ t('projects.detailPage.remove') }}
                </a-button>
              </template>
            </a-table-column>
          </BusinessTable>
        </SectionCard>

        <SectionCard v-if="hasPermission('payment:view')" :bordered="false" class="detail-card">
          <template #title>
            {{ t('projects.detailPage.payments') }}
          </template>
          <template #extra>
            <a-button
              v-if="hasPermission('payment:operate')"
              type="primary"
              size="small"
              @click="openPayment()"
            >
              {{ t('projects.detailPage.addPayment') }}
            </a-button>
          </template>
          <BusinessTable
            :data="paymentList"
            bordered
            stripe
            size="small"
            :empty-title="t('projects.detailPage.emptyPayments')"
          >
            <a-table-column
              data-index="paymentName"
              :title="t('projects.detailPage.paymentName')"
              :min-width="160"
            />
            <a-table-column :title="t('projects.detailPage.plannedDate')" :width="120">
              <template #cell="{ record: row }">
                {{ formatDate(row.dueDate) }}
              </template>
            </a-table-column>
            <a-table-column :title="t('projects.detailPage.receivable')" :width="150" align="right">
              <template #cell="{ record: row }">
                {{ row.originalCurrency }} {{ formatAmount(row.originalAmount) }}
              </template>
            </a-table-column>
            <a-table-column :title="t('projects.detailPage.received')" :width="150" align="right">
              <template #cell="{ record: row }">
                {{ row.originalCurrency }} {{ formatAmount(row.receivedOriginalAmount) }}
              </template>
            </a-table-column>
            <a-table-column :title="t('common.status')" :width="110">
              <template #cell="{ record: row }">
                <StatusBadge
                  domain="payment"
                  :status="row.status"
                  :label="paymentStatusLabel(row.status)"
                />
              </template>
            </a-table-column>
            <a-table-column
              v-if="hasPermission('payment:operate')"
              :title="t('common.action')"
              :width="80"
            >
              <template #cell="{ record: row }">
                <a-button type="text" @click="openPayment(row)">
                  {{ t('common.edit') }}
                </a-button>
              </template>
            </a-table-column>
          </BusinessTable>
        </SectionCard>
      </template>
    </a-spin>

    <BusinessModal
      v-model:visible="stageModalVisible"
      :title="t('projects.detailPage.adjustStage')"
      :ok-loading="commandLoading"
      :on-before-ok="saveStage"
    >
      <a-form :model="stageForm" layout="vertical">
        <a-form-item :label="t('projects.detailPage.targetStage')" required>
          <a-select v-model="stageForm.targetStage">
            <a-option
              v-for="item in STAGE_OPTIONS"
              :key="item.value"
              :label="t(item.label)"
              :value="item.value"
            />
          </a-select>
        </a-form-item>
        <a-form-item :label="t('projects.detailPage.adjustReason')">
          <a-textarea
            v-model="stageForm.reason"
            :auto-size="{ minRows: 3, maxRows: 6 }"
            :placeholder="t('projects.detailPage.rollbackPlaceholder')"
          />
        </a-form-item>
      </a-form>
    </BusinessModal>

    <BusinessModal
      v-model:visible="acceptanceModalVisible"
      :title="t('projects.detailPage.acceptanceTitle')"
      :ok-loading="commandLoading"
      :on-before-ok="saveAcceptance"
    >
      <a-form :model="acceptanceForm" layout="vertical">
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item :label="t('projects.detailPage.expectedAcceptanceLabel')">
              <a-date-picker
                v-model="acceptanceForm.expectedAcceptanceAt"
                format="YYYY-MM-DD"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="t('projects.detailPage.actualAcceptanceLabel')">
              <a-date-picker
                v-model="acceptanceForm.actualAcceptanceAt"
                format="YYYY-MM-DD"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item :label="t('projects.detailPage.adjustmentNote')">
          <a-textarea v-model="acceptanceForm.reason" :auto-size="{ minRows: 3, maxRows: 6 }" />
        </a-form-item>
      </a-form>
    </BusinessModal>

    <BusinessModal
      v-model:visible="memberModalVisible"
      :title="t('projects.detailPage.addMemberTitle')"
      :on-before-ok="handleAddMember"
    >
      <a-form :model="memberForm" layout="vertical">
        <a-form-item :label="t('projects.detailPage.employee')" required>
          <a-select
            v-model="memberForm.userId"
            allow-search
            :placeholder="t('projects.detailPage.employeePlaceholder')"
          >
            <a-option
              v-for="user in userOptions"
              :key="user.id"
              :label="referenceLabel(user)"
              :value="user.id"
            />
          </a-select>
        </a-form-item>
        <a-form-item :label="t('projects.detailPage.position')">
          <a-select v-model="memberForm.projectRole">
            <a-option
              v-for="role in PROJECT_ROLE_OPTIONS"
              :key="role.value"
              :label="t(role.label)"
              :value="role.value"
            />
          </a-select>
        </a-form-item>
      </a-form>
    </BusinessModal>

    <BusinessModal
      v-model:visible="paymentModalVisible"
      :title="
        editingPaymentId
          ? t('projects.detailPage.editPayment')
          : t('projects.detailPage.newPayment')
      "
      :width="620"
      :on-before-ok="savePayment"
    >
      <a-form :model="paymentForm" layout="vertical">
        <a-form-item :label="t('projects.detailPage.paymentName')" required>
          <a-input
            v-model="paymentForm.paymentName"
            :placeholder="t('projects.detailPage.paymentPlaceholder')"
          />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item :label="t('projects.detailPage.plannedDate')">
              <a-date-picker
                v-model="paymentForm.dueDate"
                format="YYYY-MM-DD"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="t('projects.detailPage.receivedDate')">
              <a-date-picker
                v-model="paymentForm.receivedDate"
                format="YYYY-MM-DD"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item :label="t('projects.detailPage.receivable')">
              <a-input-number
                v-model="paymentForm.originalAmount"
                :min="0"
                :precision="2"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="t('projects.detailPage.received')">
              <a-input-number
                v-model="paymentForm.receivedOriginalAmount"
                :min="0"
                :precision="2"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item :label="t('projects.detailPage.note')">
          <a-textarea v-model="paymentForm.remark" :auto-size="{ minRows: 2, maxRows: 5 }" />
        </a-form-item>
      </a-form>
    </BusinessModal>
  </PageContainer>
</template>

<style scoped lang="scss">
.project-detail-page {
  min-width: 0;
}

.detail-loading {
  display: block;
  min-height: 240px;
}

.detail-card {
  margin-bottom: 8px;
  border: 1px solid var(--color-border-2);
  border-radius: 0;
}

.detail-card :deep(.arco-card-header) {
  min-height: 40px;
  padding: 8px 12px;
}

.detail-card :deep(.arco-card-body) {
  padding: 10px 12px;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

@media (max-width: 900px) {
  :deep(.arco-descriptions-layout-fixed) {
    table-layout: auto;
  }
}
</style>
