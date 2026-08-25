<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Message from '@arco-design/web-vue/es/message'
import { IconPlus, IconSearch } from '@arco-design/web-vue/es/icon'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { BusinessTable } from '@/design-system'
import {
  archiveTemplateApi,
  type ArchiveTemplateDraftStructurePayload,
  type ArchiveTemplateSortField,
  type ArchiveTemplateSortOrder,
} from '@/domains/archive/api/archive-template.api'
import {
  useArchiveTemplateDetailQuery,
  useArchiveTemplateFormOptionsQueries,
  useArchiveTemplateListQuery,
  useArchiveTemplateVersionQuery,
  useArchiveTemplateVersionsQuery,
} from '@/domains/archive/queries/useArchiveQueries'
import { queryKeys } from '@/query/keys'
import { useFieldConfig } from '@/platform/field-configuration'
import { firstRouteParam, preservedRouteQuery } from '@/router/query-state'
import { usePermissionStore } from '@/store/permission'
import type {
  ArchiveTemplate,
  ArchiveTemplateStatus,
  ArchiveTemplateVersionFolder,
} from '@/domains/archive/types/archive'
import type { Language } from '@/types/language'
import { arcoConfirm } from '@/utils/arco-dialog'

interface EditableVersionFolder extends Omit<
  ArchiveTemplateVersionFolder,
  'items' | 'description'
> {
  description: string
}

const standardFolderNames = [
  '项目临时资料',
  '售前方案及节能计算表',
  '项目成本预算（售前版）',
  '项目报价清单',
  '项目招标相关文件（如有）',
  '投标文件或提交的方案',
  '中标通知书',
  '项目合同（盖章扫描件）',
  '项目实施计划表',
  '施工方案（深化版）',
  '系统设计（深化版）',
  '硬件设计（深化版）',
  '软件设计（深化版）',
  '项目成本预算（深化版）',
  '深化方案评审记录表',
  '采购申请单',
  '分包管理',
  '材料报验记录表',
  '柜子出厂测试表',
  '安全技术交底表',
  '设备运输（海外项目）',
  '工作联系函',
  '工程签证',
  '进度周报',
  '硬件调试记录表',
  '软件调试记录表',
  '节能调试记录表',
  '使用操作维护手册',
  '项目竣工图',
  '培训记录签字表',
  '项目竣工验收报告',
  '与甲方结算清单',
  '与分包结算清单（如有）',
  '项目最终成本核算表',
  '项目信息留存表',
  '项目系统备份',
  '项目总结复盘报告',
] as const

const permissionStore = usePermissionStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const queryClient = useQueryClient()
const fieldConfig = useFieldConfig('archive-template')

const searchInput = ref('')
const submittedKeyword = ref('')
const sortBy = ref<ArchiveTemplateSortField>()
const sortOrder = ref<ArchiveTemplateSortOrder>()
const createVisible = ref(false)
const createForm = reactive({
  templateCode: '',
  templateName: '',
  projectType: '',
  countryCode: '',
  languageCode: '',
  version: 'V1.0',
  description: '',
})

const detailVisible = ref(false)
const selectedTemplateId = ref('')
const selectedTemplateFallback = ref<ArchiveTemplate | null>(null)
const selectedVersionId = ref('')
const editableFolders = ref<EditableVersionFolder[]>([])
const creatingVersionFor = ref('')

function queryString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

function listRouteQuery() {
  return preservedRouteQuery(route.query, ['versionId'])
}

const templateListParams = computed(() => ({
  keyword: submittedKeyword.value || undefined,
  sortBy: sortBy.value,
  sortOrder: sortOrder.value,
}))
const templateListQuery = useArchiveTemplateListQuery(templateListParams)
const templateDetailQuery = useArchiveTemplateDetailQuery(selectedTemplateId, detailVisible)
const templateVersionsQuery = useArchiveTemplateVersionsQuery(selectedTemplateId, detailVisible)
const templateVersionQuery = useArchiveTemplateVersionQuery(selectedVersionId, detailVisible)
const formOptionQueries = useArchiveTemplateFormOptionsQueries()
const records = computed(() => templateListQuery.data.value ?? [])
const selectedTemplate = computed<ArchiveTemplate | null>(() => {
  const detail = templateDetailQuery.data.value
  if (detail?.id === selectedTemplateId.value) return detail
  return selectedTemplateFallback.value?.id === selectedTemplateId.value
    ? selectedTemplateFallback.value
    : null
})
const versions = computed(() => templateVersionsQuery.data.value ?? [])
const selectedVersion = computed(() => templateVersionQuery.data.value ?? null)
const countries = computed(() => fieldConfig.getFieldOptions('COUNTRY'))
const languages = computed<Language[]>(() => formOptionQueries.value[0].data ?? [])
const projectTypes = computed(() => fieldConfig.getFieldOptions('PROJECT_TYPE'))
const loading = computed(() => templateListQuery.isFetching.value)
const listError = computed(() => templateListQuery.error.value)
const detailLoading = computed(
  () =>
    templateDetailQuery.isFetching.value ||
    templateVersionsQuery.isFetching.value ||
    templateVersionQuery.isFetching.value,
)

const canEditVersion = computed(() =>
  Boolean(
    selectedVersion.value &&
    ['DRAFT', 'REJECTED'].includes(selectedVersion.value.status) &&
    permissionStore.hasPermission('archive_template:update_draft'),
  ),
)

const directoryScale = computed(() => editableFolders.value.length)

function makeStableKey(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/gu, '').slice(0, 16)
      : `${Date.now()}${Math.random().toString(16).slice(2)}`
  return `${prefix}-${random}`.slice(0, 100)
}

function statusMeta(status: ArchiveTemplateStatus): { label: string; color: string } {
  const map: Record<ArchiveTemplateStatus, { label: string; color: string }> = {
    DRAFT: { label: 'archiveTemplate.status.DRAFT', color: 'gray' },
    IN_REVIEW: { label: 'archiveTemplate.status.IN_REVIEW', color: 'orange' },
    PUBLISHED: { label: 'archiveTemplate.status.PUBLISHED', color: 'green' },
    REJECTED: { label: 'archiveTemplate.status.REJECTED', color: 'red' },
    DISABLED: { label: 'archiveTemplate.status.DISABLED', color: 'gray' },
  }
  const meta = map[status]
  return { ...meta, label: t(meta.label) }
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function runSearch(): void {
  submittedKeyword.value = searchInput.value.trim()
}

function toggleSort(field: ArchiveTemplateSortField): void {
  if (sortBy.value !== field) {
    sortBy.value = field
    sortOrder.value = 'asc'
    return
  }
  if (sortOrder.value === 'asc') {
    sortOrder.value = 'desc'
    return
  }
  sortBy.value = undefined
  sortOrder.value = undefined
}

function sortIndicator(field: ArchiveTemplateSortField): string {
  if (sortBy.value !== field) return '↕'
  return sortOrder.value === 'desc' ? '↓' : '↑'
}

function projectTypeLabel(value?: string | null): string {
  return fieldConfig.getFieldLabel('PROJECT_TYPE', value) || t('archiveTemplate.general')
}

const createTemplateMutation = useMutation({
  mutationFn: archiveTemplateApi.create,
  retry: false,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.archiveTemplates.lists() }),
})

const createVersionMutation = useMutation({
  mutationFn: ({ templateId }: { templateId: string }) =>
    archiveTemplateApi.createVersion(templateId),
  retry: false,
  onSuccess: async (_, variables) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.archiveTemplates.lists() }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.archiveTemplates.versions(variables.templateId),
      }),
    ]),
})

const saveStructureMutation = useMutation({
  mutationFn: ({
    versionId,
    data,
  }: {
    versionId: string
    data: ArchiveTemplateDraftStructurePayload
  }) => archiveTemplateApi.replaceDraftStructure(versionId, data),
  retry: false,
  onSuccess: (saved, variables) => {
    queryClient.setQueryData(queryKeys.archiveTemplates.version(variables.versionId), saved)
    return selectedTemplate.value
      ? queryClient.invalidateQueries({
          queryKey: queryKeys.archiveTemplates.versions(selectedTemplate.value.id),
        })
      : undefined
  },
})

const publishVersionMutation = useMutation({
  mutationFn: (versionId: string) => archiveTemplateApi.publishVersion(versionId),
  retry: false,
  onSuccess: async (_, versionId) => {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: queryKeys.archiveTemplates.version(versionId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.archiveTemplates.lists() }),
    ]
    if (selectedTemplate.value) {
      invalidations.push(
        queryClient.invalidateQueries({
          queryKey: queryKeys.archiveTemplates.versions(selectedTemplate.value.id),
        }),
      )
    }
    await Promise.all(invalidations)
  },
})

const disableTemplateMutation = useMutation({
  mutationFn: (templateId: string) => archiveTemplateApi.disable(templateId),
  retry: false,
  onSuccess: (_, templateId) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.archiveTemplates.lists() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.archiveTemplates.detail(templateId) }),
    ]),
})
const deleteTemplateMutation = useMutation({
  mutationFn: archiveTemplateApi.remove,
  retry: false,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.archiveTemplates.lists() }),
})

const creating = computed(() => createTemplateMutation.isPending.value)
const savingStructure = computed(() => saveStructureMutation.isPending.value)
const publishingVersion = computed(() => publishVersionMutation.isPending.value)

function resetCreateForm(): void {
  Object.assign(createForm, {
    templateCode: '',
    templateName: '',
    projectType: '',
    countryCode: String(fieldConfig.getField('COUNTRY')?.defaultValue ?? ''),
    languageCode: '',
    version: 'V1.0',
    description: '',
  })
}

function openCreate(): void {
  resetCreateForm()
  createVisible.value = true
}

async function createTemplate(): Promise<void> {
  if (!createForm.templateCode.trim() || !createForm.templateName.trim()) {
    Message.warning(t('archiveTemplate.validation.masterRequired'))
    return
  }
  const created = await createTemplateMutation.mutateAsync({
    templateCode: createForm.templateCode.trim(),
    templateName: createForm.templateName.trim(),
    projectType: createForm.projectType || undefined,
    countryCode: createForm.countryCode || undefined,
    languageCode: createForm.languageCode || undefined,
    version: createForm.version.trim() || 'V1.0',
    description: createForm.description.trim() || undefined,
  })
  Message.success(t('archiveTemplate.messages.created'))
  createVisible.value = false
  await openDetail(created, created.draftVersion.id)
}

function toEditableFolders(folders: ArchiveTemplateVersionFolder[]): EditableVersionFolder[] {
  return folders.map((folder) => ({
    id: folder.id,
    stableKey: folder.stableKey,
    name: folder.name,
    sortOrder: folder.sortOrder,
    description: folder.description ?? '',
  }))
}

async function openDetail(row: ArchiveTemplate, preferredVersionId?: string): Promise<void> {
  selectedTemplateFallback.value = row
  await router.push({
    name: 'ArchiveTemplateDetail',
    params: { templateId: row.id },
    query: {
      ...listRouteQuery(),
      ...(preferredVersionId ? { versionId: preferredVersionId } : {}),
    },
  })
}

async function loadVersion(value: unknown): Promise<void> {
  const versionId = typeof value === 'string' ? value : ''
  const location = {
    name: 'ArchiveTemplateDetail',
    params: { templateId: selectedTemplateId.value },
    query: {
      ...listRouteQuery(),
      ...(versionId ? { versionId } : {}),
    },
  }
  const target = router.resolve(location)
  if (target.fullPath === route.fullPath) {
    await templateVersionQuery.refetch()
  } else {
    await router.replace(location)
  }
}

function closeDetail(): void {
  detailVisible.value = false
  selectedTemplateId.value = ''
  selectedTemplateFallback.value = null
  selectedVersionId.value = ''
  editableFolders.value = []
  void router.push({ name: 'ArchiveTemplate', query: listRouteQuery() })
}

function handleDetailVisibility(visible: boolean): void {
  if (!visible) closeDetail()
}

function syncRouteIntent(): void {
  const templateId = firstRouteParam(route.params.templateId)
  if (!templateId) {
    detailVisible.value = false
    selectedTemplateId.value = ''
    selectedTemplateFallback.value = null
    selectedVersionId.value = ''
    editableFolders.value = []
    return
  }

  if (selectedTemplateId.value !== templateId) {
    selectedTemplateId.value = templateId
    selectedVersionId.value = ''
    editableFolders.value = []
  }
  detailVisible.value = true
}

function syncSelectedVersion(): void {
  if (!detailVisible.value || !templateVersionsQuery.isSuccess.value) return
  const requestedVersionId = queryString(route.query.versionId)
  const publishedVersionId = selectedTemplate.value?.currentPublishedVersion?.id ?? ''
  const selected =
    versions.value.find((version) => version.id === requestedVersionId)?.id ||
    versions.value.find((version) => version.id === publishedVersionId)?.id ||
    versions.value[0]?.id ||
    ''

  selectedVersionId.value = selected
  if (requestedVersionId && requestedVersionId !== selected) {
    void router.replace({
      name: 'ArchiveTemplateDetail',
      params: { templateId: selectedTemplateId.value },
      query: {
        ...listRouteQuery(),
        ...(selected ? { versionId: selected } : {}),
      },
    })
  }
}

async function createNewVersion(row: ArchiveTemplate): Promise<void> {
  creatingVersionFor.value = row.id
  try {
    const version = await createVersionMutation.mutateAsync({ templateId: row.id })
    Message.success(t('archiveTemplate.messages.versionCreated', { version: version.versionNo }))
    const refreshed = records.value.find((item) => item.id === row.id) ?? row
    await openDetail(refreshed, version.id)
  } finally {
    creatingVersionFor.value = ''
  }
}

function addFolder(): void {
  editableFolders.value.push({
    stableKey: makeStableKey('folder'),
    name: t('archiveTemplate.newFolder'),
    description: '',
    sortOrder: editableFolders.value.length,
  })
}

function removeFolder(index: number): void {
  editableFolders.value.splice(index, 1)
}

function applyStandardFolders(): void {
  const knownKeys = new Set(editableFolders.value.map((folder) => folder.stableKey))
  standardFolderNames.forEach((name, index) => {
    const stableKey = `standard-folder-${String(index + 1).padStart(2, '0')}`
    if (knownKeys.has(stableKey)) return
    editableFolders.value.push({
      stableKey,
      name,
      description: '',
      sortOrder: editableFolders.value.length,
    })
  })
  Message.success(t('archiveTemplate.messages.standardFoldersAdded'))
}

function structurePayload(): ArchiveTemplateDraftStructurePayload {
  return {
    revision: selectedVersion.value?.revision ?? 1,
    folders: editableFolders.value.map((folder, folderIndex) => ({
      stableKey: folder.stableKey,
      name: folder.name.trim(),
      description: folder.description?.trim() || undefined,
      sortOrder: folderIndex,
    })),
  }
}

function validateStructure(): boolean {
  if (!editableFolders.value.length) {
    Message.warning(t('archiveTemplate.validation.folderRequired'))
    return false
  }
  if (editableFolders.value.some((folder) => !folder.name.trim())) {
    Message.warning(t('archiveTemplate.validation.folderNameRequired'))
    return false
  }
  return true
}

async function saveStructure(showMessage = true): Promise<boolean> {
  if (!selectedVersion.value || !canEditVersion.value || !validateStructure()) return false
  const saved = await saveStructureMutation.mutateAsync({
    versionId: selectedVersion.value.id,
    data: structurePayload(),
  })
  editableFolders.value = toEditableFolders(saved.folders ?? [])
  if (showMessage) Message.success(t('archiveTemplate.messages.structureSaved'))
  return true
}

async function publishVersion(): Promise<void> {
  if (!selectedVersion.value) return
  if (!(await saveStructure(false))) return
  await publishVersionMutation.mutateAsync(selectedVersion.value.id)
  Message.success(t('archiveTemplate.messages.published'))
}

async function disableTemplate(row: ArchiveTemplate): Promise<void> {
  try {
    await arcoConfirm(
      t('archiveTemplate.disable.confirm', { name: row.templateName }),
      t('archiveTemplate.disable.title'),
      { type: 'warning', confirmButtonText: t('archiveTemplate.disable.action') },
    )
  } catch {
    return
  }
  await disableTemplateMutation.mutateAsync(row.id)
  Message.success(t('archiveTemplate.messages.disabled'))
}

async function deleteTemplate(row: ArchiveTemplate): Promise<void> {
  try {
    await arcoConfirm(
      `确定删除档案模板“${row.templateName}”吗？已被项目引用的模板将拒绝删除。`,
      '确认删除档案模板',
      { type: 'error', confirmButtonText: '确认删除' },
    )
  } catch {
    return
  }
  try {
    await deleteTemplateMutation.mutateAsync(row.id)
    Message.success(`档案模板“${row.templateName}”已删除`)
  } catch {
    // The shared request layer displays the specific server-side blocker.
  }
}

watch(() => route.fullPath, syncRouteIntent, { immediate: true })

watch(
  [
    () => versions.value,
    () => selectedTemplate.value?.currentPublishedVersion?.id,
    () => templateVersionsQuery.isSuccess.value,
    () => route.query.versionId,
  ],
  syncSelectedVersion,
  { immediate: true },
)

watch(
  () => templateVersionQuery.data.value,
  (version) => {
    editableFolders.value = version ? toEditableFolders(version.folders ?? []) : []
  },
  { immediate: true },
)
</script>

<template>
  <section class="template-page">
    <header class="page-header">
      <div class="search-group">
        <a-input
          v-model="searchInput"
          class="template-search"
          :placeholder="t('archiveTemplate.searchPlaceholder')"
          @press-enter="runSearch"
        />
        <a-button type="primary" class="query-button" @click="runSearch">
          <template #icon>
            <IconSearch />
          </template>
          {{ t('archiveTemplate.query') }}
        </a-button>
      </div>
      <a-button
        v-if="permissionStore.hasPermission('archive_template:create')"
        type="primary"
        class="create-button"
        @click="openCreate"
      >
        <template #icon>
          <IconPlus />
        </template>
        {{ t('archiveTemplate.create') }}
      </a-button>
    </header>

    <section class="table-card">
      <BusinessTable
        class="archive-template-table"
        :data="records"
        :loading="loading"
        :error="listError"
        row-key="id"
        size="small"
        :bordered="{ wrapper: false, cell: true }"
        stripe
        fit-container
        :batch-size="Math.max(20, records.length)"
        :scroll="{ minWidth: 1208 }"
        :empty-title="t('common.noData')"
        :retry-label="t('common.retry')"
        @retry="templateListQuery.refetch()"
      >
        <a-table-column :min-width="280" align="left">
          <template #title>
            <a-button
              class="column-sort"
              type="text"
              v-bind="{ 'aria-label': t('archiveTemplate.sortByName') }"
              @click="toggleSort('templateName')"
            >
              <span>{{ t('archiveTemplate.columns.name') }}</span>
              <span class="column-sort__indicator" aria-hidden="true">
                {{ sortIndicator('templateName') }}
              </span>
            </a-button>
          </template>
          <template #cell="{ record }">
            <a-link
              class="template-link"
              v-bind="{ title: record.templateName }"
              @click="openDetail(record)"
            >
              {{ record.templateName }}
            </a-link>
          </template>
        </a-table-column>
        <a-table-column
          :title="t('archiveTemplate.columns.projectType')"
          :min-width="120"
          align="center"
        >
          <template #cell="{ record }">
            <span class="single-line-cell" :title="projectTypeLabel(record.projectType)">
              {{ projectTypeLabel(record.projectType) }}
            </span>
          </template>
        </a-table-column>
        <a-table-column :width="111" align="center">
          <template #title>
            <a-button
              class="column-sort"
              type="text"
              v-bind="{ 'aria-label': t('archiveTemplate.sortByVersion') }"
              @click="toggleSort('currentVersion')"
            >
              <span>{{ t('archiveTemplate.columns.currentVersion') }}</span>
              <span class="column-sort__indicator" aria-hidden="true">
                {{ sortIndicator('currentVersion') }}
              </span>
            </a-button>
          </template>
          <template #cell="{ record }">
            {{ record.currentPublishedVersion?.versionNo || t('archiveTemplate.notPublished') }}
          </template>
        </a-table-column>
        <a-table-column :title="t('archiveTemplate.columns.scale')" :width="111" align="center">
          <template #cell="{ record }">
            <span v-if="record.currentPublishedVersion?._count">
              {{
                t('archiveTemplate.folderCount', {
                  count: record.currentPublishedVersion._count.folders,
                })
              }}
            </span>
            <span v-else>—</span>
          </template>
        </a-table-column>
        <a-table-column :title="t('archiveTemplate.columns.projects')" :width="95" align="center">
          <template #cell="{ record }">
            {{ record._count?.projectSnapshots || 0 }}
          </template>
        </a-table-column>
        <a-table-column
          :title="t('archiveTemplate.columns.updatedBy')"
          :min-width="160"
          align="center"
        >
          <template #cell="{ record }">
            <span
              class="single-line-cell"
              :title="record.updater?.realName || t('archiveTemplate.system')"
            >
              {{ record.updater?.realName || t('archiveTemplate.system') }}
            </span>
          </template>
        </a-table-column>
        <a-table-column :title="t('archiveTemplate.columns.time')" :width="149" align="center">
          <template #cell="{ record }">
            {{ formatDate(record.updatedAt) }}
          </template>
        </a-table-column>
        <a-table-column
          :title="t('common.action')"
          :width="238"
          fixed="right"
          align="center"
        >
          <template #cell="{ record }">
            <span class="table-actions">
              <a-button
                class="table-action"
                type="text"
                size="mini"
                @click="openDetail(record)"
              >
                {{ t('common.view') }}
              </a-button>
              <a-button
                v-if="
                  record.status !== 'DISABLED' &&
                    permissionStore.hasPermission('archive_template:update_draft')
                "
                class="table-action"
                type="text"
                size="mini"
                :disabled="creatingVersionFor === record.id"
                @click="createNewVersion(record)"
              >
                {{ t('archiveTemplate.createVersion') }}
              </a-button>
              <a-button
                v-if="
                  record.status !== 'DISABLED' &&
                    permissionStore.hasPermission('archive_template:disable')
                "
                class="table-action table-action--danger"
                type="text"
                size="mini"
                status="danger"
                @click="disableTemplate(record)"
              >
                {{ t('archiveTemplate.disable.action') }}
              </a-button>
              <a-button
                v-if="permissionStore.hasPermission('archive_template:delete')"
                class="table-action table-action--danger"
                type="text"
                size="mini"
                status="danger"
                :loading="deleteTemplateMutation.isPending.value"
                @click="deleteTemplate(record)"
              >
                {{ t('common.delete') }}
              </a-button>
            </span>
          </template>
        </a-table-column>
      </BusinessTable>
    </section>

    <a-modal
      v-model:visible="createVisible"
      :title="t('archiveTemplate.createTitle')"
      :width="620"
      :footer="false"
    >
      <a-form :model="createForm" layout="vertical">
        <a-grid :cols="2" :col-gap="16">
          <a-grid-item>
            <a-form-item :label="t('archiveTemplate.fields.code')" required>
              <a-input v-model="createForm.templateCode" :max-length="50" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('archiveTemplate.fields.name')" required>
              <a-input v-model="createForm.templateName" :max-length="100" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('archiveTemplate.columns.projectType')">
              <a-select v-model="createForm.projectType" allow-clear>
                <a-option
                  v-for="item in projectTypes"
                  :key="item.value"
                  :value="item.value"
                  :label="item.label"
                />
              </a-select>
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('archiveTemplate.fields.initialVersion')">
              <a-input v-model="createForm.version" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('common.country')">
              <a-select v-model="createForm.countryCode" allow-search allow-clear>
                <a-option v-for="item in countries" :key="item.value" :value="item.value">
                  {{ item.label }}
                </a-option>
              </a-select>
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('archiveTemplate.fields.language')">
              <a-select v-model="createForm.languageCode" allow-clear>
                <a-option
                  v-for="item in languages"
                  :key="item.languageCode"
                  :value="item.languageCode"
                >
                  {{ item.languageName }}
                </a-option>
              </a-select>
            </a-form-item>
          </a-grid-item>
        </a-grid>
        <a-form-item :label="t('common.description')">
          <a-textarea v-model="createForm.description" />
        </a-form-item>
        <div class="modal-actions">
          <a-button :disabled="creating" @click="createVisible = false">
            {{ t('common.cancel') }}
          </a-button>
          <a-button type="primary" :loading="creating" @click="createTemplate">
            {{ t('archiveTemplate.createAndEdit') }}
          </a-button>
        </div>
      </a-form>
    </a-modal>

    <a-modal
      class="archive-template-detail-modal"
      :visible="detailVisible"
      :width="960"
      :top="24"
      :align-center="false"
      :body-style="{
        padding: '0 20px 20px',
        maxHeight: 'calc(100vh - 128px)',
        overflowY: 'auto',
      }"
      :footer="false"
      unmount-on-close
      @update:visible="handleDetailVisibility"
    >
      <template #title>
        {{ selectedTemplate?.templateName || t('archiveTemplate.detailTitle') }}
      </template>
      <a-spin :loading="detailLoading" class="detail-spin">
        <template v-if="selectedTemplate">
          <section class="detail-toolbar">
            <div class="version-picker">
              <span>{{ t('archiveTemplate.viewVersion') }}</span>
              <a-select :model-value="selectedVersionId" @change="loadVersion">
                <a-option v-for="version in versions" :key="version.id" :value="version.id">
                  {{ version.versionNo }} · {{ statusMeta(version.status).label }}
                </a-option>
              </a-select>
              <a-tag v-if="selectedVersion" :color="statusMeta(selectedVersion.status).color">
                {{ statusMeta(selectedVersion.status).label }}
              </a-tag>
            </div>
            <a-space v-if="selectedVersion">
              <a-button v-if="canEditVersion" @click="applyStandardFolders">
                {{ t('archiveTemplate.addStandardFolders') }}
              </a-button>
              <a-button v-if="canEditVersion" @click="addFolder">
                {{ t('archiveTemplate.addFolder') }}
              </a-button>
              <a-button v-if="canEditVersion" :loading="savingStructure" @click="saveStructure()">
                {{ t('archiveTemplate.saveDraft') }}
              </a-button>
              <a-button
                v-if="
                  canEditVersion && permissionStore.hasPermission('archive_template:submit_review')
                "
                type="primary"
                :loading="publishingVersion"
                @click="publishVersion"
              >
                {{ t('archiveTemplate.publishVersion') }}
              </a-button>
            </a-space>
          </section>

          <a-alert v-if="selectedVersion?.status === 'PUBLISHED'" type="info" class="detail-alert">
            {{ t('archiveTemplate.publishedHint') }}
          </a-alert>

          <div v-if="selectedVersion" class="scale-line">
            <a-tag color="arcoblue">
              {{ t('archiveTemplate.folderCount', { count: directoryScale }) }}
            </a-tag>
            <span>{{
              t('archiveTemplate.versionLabel', { version: selectedVersion.versionNo })
            }}</span>
            <span>{{ t('archiveTemplate.folderTemplateHint') }}</span>
          </div>

          <a-empty
            v-if="selectedVersion && !editableFolders.length"
            :description="t('archiveTemplate.emptyDraft')"
          />

          <section v-else class="structure-list">
            <a-card
              v-for="(folder, folderIndex) in editableFolders"
              :key="folder.stableKey"
              :bordered="true"
              class="folder-editor"
            >
              <div class="folder-editor-title">
                <a-tag class="folder-index" size="large">
                  {{ folderIndex + 1 }}
                </a-tag>
                <div v-if="canEditVersion" class="folder-fields">
                  <a-input
                    v-model="folder.name"
                    :placeholder="t('archiveTemplate.folderNamePlaceholder')"
                  />
                  <a-input
                    v-model="folder.description"
                    :placeholder="t('archiveTemplate.folderDescriptionPlaceholder')"
                  />
                </div>
                <div v-else class="folder-summary">
                  <strong>{{ folder.name }}</strong>
                  <span>{{ folder.description || t('archiveTemplate.noDescription') }}</span>
                </div>
                <a-button
                  v-if="canEditVersion"
                  type="text"
                  size="mini"
                  status="danger"
                  @click="removeFolder(folderIndex)"
                >
                  {{ t('archiveTemplate.deleteFolder') }}
                </a-button>
              </div>
            </a-card>
          </section>
        </template>
      </a-spin>
    </a-modal>
  </section>
</template>

<style scoped lang="scss">
.template-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 32px minmax(0, 1fr);
  gap: 12px;
  height: 100%;
  min-width: 0;
  padding: 13px;
  background: #fff;
  color: #1d2129;
  font-family: 'Noto Sans SC', sans-serif;
}

.detail-toolbar,
.folder-editor-title,
.modal-actions,
.scale-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-header {
  display: flex;
  height: 32px;
  min-height: 32px;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
}

.table-card {
  display: flex;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.search-group {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.template-search {
  width: 280px;
  height: 32px;
  flex: 0 0 280px;
}

.template-search :deep(.arco-input-wrapper) {
  height: 32px;
  padding: 0 12px;
  background: #f2f3f5;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.template-search :deep(.arco-input) {
  height: 22px;
  padding: 0;
  color: #1d2129;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}

.template-search :deep(.arco-input::placeholder) {
  color: #86909c;
}

.query-button,
.create-button {
  height: 32px;
  padding: 0 16px;
  border: 0;
  border-radius: 0;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}

.query-button {
  background: #2563eb;
}

.create-button {
  background: #165dff;
}

.query-button :deep(.arco-btn-icon),
.create-button :deep(.arco-btn-icon) {
  display: inline-flex;
  width: 14px;
  height: 14px;
  margin-right: 8px;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.table-card :deep(.business-table) {
  height: 100%;
}

.table-card :deep(.business-table__viewport) {
  height: 100%;
  max-height: none;
  overflow: auto;
  scrollbar-gutter: auto;
}

.table-card :deep(.archive-template-table),
.table-card :deep(.archive-template-table .arco-table-container),
.table-card :deep(.archive-template-table .arco-table-content) {
  height: 100%;
}

.table-card :deep(.archive-template-table .arco-table-element) {
  width: 100%;
  min-width: 1208px;
  table-layout: fixed;
}

.table-card :deep(.archive-template-table .arco-table-th),
.table-card :deep(.archive-template-table .arco-table-td) {
  box-sizing: border-box;
  height: 44px;
  padding: 0;
  border-color: #e0e0e0;
  font-size: 13px;
  line-height: normal;
}

.table-card :deep(.archive-template-table .arco-table-th) {
  background: #f2f3f5;
  color: #1d2129;
  font-weight: 500;
}

.table-card :deep(.archive-template-table .arco-table-td) {
  background: #fff;
  color: #1d2129;
  font-weight: 400;
}

.table-card :deep(.archive-template-table .arco-table-tr-stripe .arco-table-td),
.table-card :deep(.archive-template-table tbody .arco-table-tr:nth-child(even) .arco-table-td) {
  background: #f7f8fa;
}

.table-card :deep(.archive-template-table .arco-table-cell) {
  display: flex;
  height: 43px;
  min-width: 0;
  padding: 0 12px;
  align-items: center;
  overflow: hidden;
  line-height: normal;
  text-overflow: ellipsis;
}

.column-sort {
  display: inline-flex;
  padding: 0;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: #1d2129;
  cursor: pointer;
  font: inherit;
  font-weight: 500;
  white-space: nowrap;
}

.column-sort__indicator {
  color: #999;
  font-size: 13px;
  font-weight: 400;
  line-height: 1;
}

.single-line-cell {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-template-table :deep(.arco-table-col-fixed-right) {
  background: inherit;
}

.template-link {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: #165dff;
  cursor: pointer;
  font: inherit;
  font-weight: 400;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  white-space: nowrap;
}

.table-action {
  padding: 0;
  border: 0;
  background: transparent;
  color: #165dff;
  cursor: pointer;
  font: inherit;
  white-space: nowrap;
}

.table-action:disabled {
  cursor: wait;
  opacity: 0.6;
}

.table-action--danger {
  color: #f53f3f;
}

.folder-editor-title span {
  color: var(--color-text-3);
  font-size: 12px;
}

.modal-actions {
  justify-content: flex-end;
  margin-top: 20px;
}

.detail-spin {
  min-height: 360px;
}

.detail-toolbar {
  position: sticky;
  z-index: 2;
  top: 0;
  padding: 12px 0;
  background: var(--color-bg-2);
  border-bottom: 1px solid var(--color-border-2);
}

.version-picker {
  display: flex;
  align-items: center;
  gap: 10px;
}

.version-picker :deep(.arco-select-view) {
  width: 220px;
}

.detail-alert {
  margin: 14px 0;
}

.scale-line {
  justify-content: flex-start;
  margin: 14px 0;
  color: var(--color-text-3);
}

.structure-list {
  display: grid;
  gap: 12px;
}

.folder-editor :deep(.arco-card-body) {
  padding: 14px 16px;
}

.folder-editor-title {
  width: 100%;
}

.folder-fields {
  display: grid !important;
  grid-template-columns: minmax(220px, 0.8fr) minmax(320px, 1.2fr);
  min-width: 0;
  flex: 1;
  gap: 10px !important;
}

.folder-index {
  width: 30px;
  flex: 0 0 30px;
  justify-content: center;
}

.folder-summary {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 4px;
}

@media (max-width: 1100px) {
  .detail-toolbar,
  .folder-editor-title {
    align-items: flex-start;
    flex-direction: column;
  }

  .folder-fields {
    width: 100%;
    grid-template-columns: 1fr 1fr;
  }
}
</style>
