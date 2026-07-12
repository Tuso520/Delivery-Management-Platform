<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { BusinessTable } from '@/components/business'
import {
  archiveTemplateApi,
  type ArchiveTemplateDraftStructurePayload,
} from '@/api/archive-template'
import {
  useArchiveTemplateDetailQuery,
  useArchiveTemplateFormOptionsQueries,
  useArchiveTemplateListQuery,
  useArchiveTemplateVersionQuery,
  useArchiveTemplateVersionsQuery,
} from '@/composables/queries/useArchiveQueries'
import { queryKeys } from '@/query/keys'
import { firstRouteParam, preservedRouteQuery } from '@/router/query-state'
import { usePermissionStore } from '@/store/permission'
import type {
  ArchiveTemplate,
  ArchiveTemplateStatus,
  ArchiveTemplateVersionFolder,
  ArchiveTemplateVersionItem,
} from '@/types/archive'
import type { Country } from '@/types/country'
import type { Language } from '@/types/language'
import type { DictionaryItem } from '@/types/platform'
import { arcoConfirm } from '@/utils/arco-dialog'

interface EditableVersionItem extends Omit<
  ArchiveTemplateVersionItem,
  'maxFileSize' | 'description' | 'namingRule'
> {
  description: string
  namingRule: string
  maxFileSizeMb?: number
  allowedExtensionsText: string
}

interface EditableVersionFolder extends Omit<
  ArchiveTemplateVersionFolder,
  'items' | 'description'
> {
  description: string
  items: EditableVersionItem[]
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
const { t, locale } = useI18n()
const queryClient = useQueryClient()
const keyword = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '')
const appliedKeyword = ref(keyword.value)

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

const drawerVisible = ref(false)
const selectedTemplateId = ref('')
const selectedTemplateFallback = ref<ArchiveTemplate | null>(null)
const selectedVersionId = ref('')
const editableFolders = ref<EditableVersionFolder[]>([])
const creatingVersionFor = ref('')

const listParams = computed(() => ({
  keyword: appliedKeyword.value.trim() || undefined,
}))

function queryString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

function listRouteQuery() {
  return preservedRouteQuery(route.query, ['versionId'])
}

const templateListQuery = useArchiveTemplateListQuery(listParams)
const templateDetailQuery = useArchiveTemplateDetailQuery(selectedTemplateId, drawerVisible)
const templateVersionsQuery = useArchiveTemplateVersionsQuery(
  selectedTemplateId,
  drawerVisible,
)
const templateVersionQuery = useArchiveTemplateVersionQuery(selectedVersionId, drawerVisible)
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
const countries = computed<Country[]>(() => formOptionQueries.value[0].data?.items ?? [])
const languages = computed<Language[]>(() => formOptionQueries.value[1].data ?? [])
const projectTypes = computed<DictionaryItem[]>(() => formOptionQueries.value[2].data?.items ?? [])
const loading = computed(() => templateListQuery.isFetching.value)
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

const directoryScale = computed(() => ({
  folders: editableFolders.value.length,
  items: editableFolders.value.reduce((total, folder) => total + folder.items.length, 0),
}))

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
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

async function fetchRecords(): Promise<void> {
  await templateListQuery.refetch()
}

async function applyFilters(): Promise<void> {
  appliedKeyword.value = keyword.value
  await router.replace({
    path: route.path,
    query: {
      ...route.query,
      keyword: appliedKeyword.value.trim() || undefined,
    },
  })
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

const submitReviewMutation = useMutation({
  mutationFn: (versionId: string) => archiveTemplateApi.submitReview(versionId),
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

const creating = computed(() => createTemplateMutation.isPending.value)
const savingStructure = computed(() => saveStructureMutation.isPending.value)
const submittingReview = computed(() => submitReviewMutation.isPending.value)

function resetCreateForm(): void {
  Object.assign(createForm, {
    templateCode: '',
    templateName: '',
    projectType: '',
    countryCode: '',
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
    ...folder,
    description: folder.description ?? '',
    items: folder.items.map((item) => ({
      ...item,
      description: item.description ?? '',
      namingRule: item.namingRule ?? '',
      maxFileSizeMb: item.maxFileSize
        ? Math.round(Number(item.maxFileSize) / 1024 / 1024)
        : undefined,
      allowedExtensionsText: (item.allowedExtensions ?? []).join(', '),
    })),
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
  drawerVisible.value = false
  selectedTemplateId.value = ''
  selectedTemplateFallback.value = null
  selectedVersionId.value = ''
  editableFolders.value = []
  void router.push({ name: 'ArchiveTemplate', query: listRouteQuery() })
}

function handleDrawerVisibility(visible: boolean): void {
  if (!visible) closeDetail()
}

function syncRouteIntent(): void {
  const templateId = firstRouteParam(route.params.templateId)
  if (!templateId) {
    drawerVisible.value = false
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
  drawerVisible.value = true
}

function syncSelectedVersion(): void {
  if (!drawerVisible.value || !templateVersionsQuery.isSuccess.value) return
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
    items: [],
  })
}

function addItem(folder: EditableVersionFolder): void {
  folder.items.push({
    stableKey: makeStableKey('item'),
    name: t('archiveTemplate.newItem'),
    description: '',
    required: true,
    reviewRequired: false,
    approvalTemplateId: null,
    ownerRoleId: null,
    allowMultipleFiles: false,
    allowedExtensions: [],
    allowedExtensionsText: '',
    maxFileSizeMb: 100,
    namingRule: '',
    sortOrder: folder.items.length,
  })
}

function removeFolder(index: number): void {
  editableFolders.value.splice(index, 1)
}

function removeItem(folder: EditableVersionFolder, index: number): void {
  folder.items.splice(index, 1)
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
      items: [
        {
          stableKey: `${stableKey}-files`,
          name: '相关交付文件',
          description: '',
          required: false,
          reviewRequired: false,
          approvalTemplateId: null,
          ownerRoleId: null,
          allowMultipleFiles: true,
          allowedExtensions: [],
          allowedExtensionsText: '',
          maxFileSizeMb: 100,
          namingRule: '',
          sortOrder: 0,
        },
      ],
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
      items: folder.items.map((item, itemIndex) => ({
        stableKey: item.stableKey,
        name: item.name.trim(),
        description: item.description?.trim() || undefined,
        required: item.required,
        reviewRequired: item.reviewRequired,
        approvalTemplateId: item.approvalTemplateId || undefined,
        ownerRoleId: item.ownerRoleId || undefined,
        allowMultipleFiles: item.allowMultipleFiles,
        allowedExtensions: item.allowedExtensionsText
          .split(/[，,\s]+/u)
          .map((extension) => extension.replace(/^\./u, '').trim().toLowerCase())
          .filter(Boolean),
        maxFileSize: item.maxFileSizeMb ? Math.round(item.maxFileSizeMb * 1024 * 1024) : undefined,
        namingRule: item.namingRule?.trim() || undefined,
        sortOrder: itemIndex,
      })),
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
  if (editableFolders.value.some((folder) => folder.items.some((item) => !item.name.trim()))) {
    Message.warning(t('archiveTemplate.validation.itemNameRequired'))
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

async function submitVersionReview(): Promise<void> {
  if (!selectedVersion.value) return
  if (!(await saveStructure(false))) return
  await submitReviewMutation.mutateAsync(selectedVersion.value.id)
  Message.success(t('archiveTemplate.messages.reviewSubmitted'))
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
      <div>
        <h1>{{ t('archiveTemplate.title') }}</h1>
        <p>{{ t('archiveTemplate.subtitle') }}</p>
      </div>
      <a-space>
        <a-button @click="fetchRecords">
          {{ t('archiveTemplate.refresh') }}
        </a-button>
        <a-button
          v-if="permissionStore.hasPermission('archive_template:create')"
          type="primary"
          @click="openCreate"
        >
          {{ t('archiveTemplate.create') }}
        </a-button>
      </a-space>
    </header>

    <a-card :bordered="false" class="filter-card">
      <a-space fill>
        <a-input
          v-model="keyword"
          allow-clear
          :placeholder="t('archiveTemplate.searchPlaceholder')"
          @press-enter="applyFilters"
          @clear="applyFilters"
        />
        <a-button type="primary" @click="applyFilters">
          {{ t('common.search') }}
        </a-button>
      </a-space>
    </a-card>

    <a-card :bordered="false" class="table-card">
      <BusinessTable
        :data="records"
        :loading="loading"
        row-key="id"
        :scroll="{ x: 1050 }"
      >
        <a-table-column :title="t('archiveTemplate.columns.name')" :width="250">
          <template #cell="{ record }">
            <button class="template-link" type="button" @click="openDetail(record)">
              <strong>{{ record.templateName }}</strong>
              <span>{{ record.templateCode }}</span>
            </button>
          </template>
        </a-table-column>
        <a-table-column :title="t('archiveTemplate.columns.projectType')" :width="150">
          <template #cell="{ record }">
            {{
              record.projectType || t('archiveTemplate.general')
            }}
          </template>
        </a-table-column>
        <a-table-column :title="t('archiveTemplate.columns.currentVersion')" :width="120">
          <template #cell="{ record }">
            {{ record.currentPublishedVersion?.versionNo || t('archiveTemplate.notPublished') }}
          </template>
        </a-table-column>
        <a-table-column :title="t('archiveTemplate.columns.scale')" :width="130">
          <template #cell="{ record }">
            <span v-if="record.currentPublishedVersion?._count">
              {{
                t('archiveTemplate.scale', {
                  folders: record.currentPublishedVersion._count.folders,
                  items: record.currentPublishedVersion._count.versionItems,
                })
              }}
            </span>
            <span v-else>—</span>
          </template>
        </a-table-column>
        <a-table-column :title="t('archiveTemplate.columns.projects')" :width="110">
          <template #cell="{ record }">
            {{ record._count?.projectSnapshots || 0 }}
          </template>
        </a-table-column>
        <a-table-column :title="t('common.status')" :width="100">
          <template #cell="{ record }">
            <a-tag :color="statusMeta(record.status).color">
              {{ statusMeta(record.status).label }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column :title="t('archiveTemplate.columns.updatedByAt')" :width="180">
          <template #cell="{ record }">
            <div class="update-cell">
              <span>{{ record.updater?.realName || t('archiveTemplate.system') }}</span>
              <small>{{ formatDate(record.updatedAt) }}</small>
            </div>
          </template>
        </a-table-column>
        <a-table-column :title="t('common.action')" :width="210" fixed="right">
          <template #cell="{ record }">
            <a-space size="mini">
              <a-button type="text" size="mini" @click="openDetail(record)">
                {{
                  t('common.view')
                }}
              </a-button>
              <a-button
                v-if="
                  record.status !== 'DISABLED' &&
                    permissionStore.hasPermission('archive_template:update_draft')
                "
                type="text"
                size="mini"
                :loading="creatingVersionFor === record.id"
                @click="createNewVersion(record)"
              >
                {{ t('archiveTemplate.createVersion') }}
              </a-button>
              <a-button
                v-if="
                  record.status !== 'DISABLED' &&
                    permissionStore.hasPermission('archive_template:disable')
                "
                type="text"
                size="mini"
                status="danger"
                @click="disableTemplate(record)"
              >
                {{ t('archiveTemplate.disable.action') }}
              </a-button>
            </a-space>
          </template>
        </a-table-column>
      </BusinessTable>
    </a-card>

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
                  :key="item.id"
                  :value="item.itemValue"
                  :label="item.itemLabel"
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
                <a-option
                  v-for="item in countries"
                  :key="item.countryCode"
                  :value="item.countryCode"
                >
                  {{ locale === 'en-US' ? item.nameEn : item.nameZh }}
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
            {{
              t('common.cancel')
            }}
          </a-button>
          <a-button type="primary" :loading="creating" @click="createTemplate">
            {{
              t('archiveTemplate.createAndEdit')
            }}
          </a-button>
        </div>
      </a-form>
    </a-modal>

    <a-drawer
      :visible="drawerVisible"
      :width="'80vw'"
      :footer="false"
      unmount-on-close
      @update:visible="handleDrawerVisibility"
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
                {{
                  t('archiveTemplate.addFolder')
                }}
              </a-button>
              <a-button v-if="canEditVersion" :loading="savingStructure" @click="saveStructure()">
                {{ t('archiveTemplate.saveDraft') }}
              </a-button>
              <a-button
                v-if="
                  canEditVersion && permissionStore.hasPermission('archive_template:submit_review')
                "
                type="primary"
                :loading="submittingReview"
                @click="submitVersionReview"
              >
                {{ t('archiveTemplate.submitReview') }}
              </a-button>
            </a-space>
          </section>

          <a-alert v-if="selectedVersion?.status === 'PUBLISHED'" type="info" class="detail-alert">
            {{ t('archiveTemplate.publishedHint') }}
          </a-alert>

          <div v-if="selectedVersion" class="scale-line">
            <span>{{ t('archiveTemplate.folderCount', { count: directoryScale.folders }) }}</span>
            <span>{{ t('archiveTemplate.itemCount', { count: directoryScale.items }) }}</span>
            <span>{{
              t('archiveTemplate.versionLabel', { version: selectedVersion.versionNo })
            }}</span>
          </div>

          <a-empty
            v-if="selectedVersion && !editableFolders.length"
            :description="t('archiveTemplate.emptyDraft')"
          />

          <section v-else class="structure-list">
            <a-card
              v-for="(folder, folderIndex) in editableFolders"
              :key="folder.stableKey"
              :bordered="false"
              class="folder-editor"
            >
              <template #title>
                <div class="folder-editor-title">
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
                  <div v-else>
                    <strong>{{ folder.name }}</strong>
                    <span v-if="folder.description">{{ folder.description }}</span>
                  </div>
                  <a-space v-if="canEditVersion">
                    <a-button type="text" size="mini" @click="addItem(folder)">
                      {{
                        t('archiveTemplate.addItem')
                      }}
                    </a-button>
                    <a-button
                      type="text"
                      size="mini"
                      status="danger"
                      @click="removeFolder(folderIndex)"
                    >
                      {{ t('archiveTemplate.deleteFolder') }}
                    </a-button>
                  </a-space>
                </div>
              </template>

              <a-empty
                v-if="!folder.items.length"
                :description="t('archiveTemplate.emptyFolder')"
              />
              <div v-else class="item-list">
                <article
                  v-for="(item, itemIndex) in folder.items"
                  :key="item.stableKey"
                  class="item-editor"
                >
                  <template v-if="canEditVersion">
                    <div class="item-main-fields">
                      <a-input
                        v-model="item.name"
                        :placeholder="t('archiveTemplate.itemNamePlaceholder')"
                      />
                      <a-input
                        v-model="item.description"
                        :placeholder="t('archiveTemplate.itemDescriptionPlaceholder')"
                      />
                      <a-input
                        v-model="item.allowedExtensionsText"
                        :placeholder="t('archiveTemplate.extensionsPlaceholder')"
                      />
                      <a-input
                        v-model="item.namingRule"
                        :placeholder="t('archiveTemplate.namingRulePlaceholder')"
                      />
                    </div>
                    <div class="item-policies">
                      <a-checkbox v-model="item.required">
                        {{
                          t('archiveTemplate.required')
                        }}
                      </a-checkbox>
                      <a-checkbox v-model="item.reviewRequired">
                        {{
                          t('archiveTemplate.reviewRequired')
                        }}
                      </a-checkbox>
                      <a-checkbox v-model="item.allowMultipleFiles">
                        {{
                          t('archiveTemplate.allowMultipleFiles')
                        }}
                      </a-checkbox>
                      <a-input-number
                        v-model="item.maxFileSizeMb"
                        :min="1"
                        :max="1024"
                        hide-button
                      >
                        <template #suffix>
                          MB
                        </template>
                      </a-input-number>
                      <a-button type="text" status="danger" @click="removeItem(folder, itemIndex)">
                        {{ t('common.delete') }}
                      </a-button>
                    </div>
                  </template>
                  <template v-else>
                    <div class="readonly-item">
                      <div>
                        <strong>{{ item.name }}</strong>
                        <p>{{ item.description || t('archiveTemplate.noDescription') }}</p>
                      </div>
                      <a-space>
                        <a-tag v-if="item.required" color="red">
                          {{
                            t('archiveTemplate.required')
                          }}
                        </a-tag>
                        <a-tag v-if="item.reviewRequired" color="orange">
                          {{
                            t('archiveTemplate.reviewRequiredShort')
                          }}
                        </a-tag>
                        <a-tag v-if="item.allowMultipleFiles">
                          {{
                            t('archiveTemplate.allowMultipleFilesShort')
                          }}
                        </a-tag>
                      </a-space>
                    </div>
                  </template>
                </article>
              </div>
            </a-card>
          </section>
        </template>
      </a-spin>
    </a-drawer>
  </section>
</template>

<style scoped lang="scss">
.template-page {
  display: grid;
  gap: 16px;
}

.page-header,
.detail-toolbar,
.folder-editor-title,
.readonly-item,
.modal-actions,
.scale-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-header h1 {
  margin: 0;
  color: var(--color-text-1);
  font-size: 22px;
}

.page-header p {
  margin: 6px 0 0;
  color: var(--color-text-3);
}

.filter-card :deep(.arco-card-body) {
  padding: 14px 16px;
}

.filter-card :deep(.arco-input-wrapper) {
  max-width: 520px;
}

.table-card :deep(.arco-card-body) {
  padding: 0;
}

.template-link {
  display: grid;
  gap: 3px;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--primary-6));
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.template-link span,
.update-cell small,
.folder-editor-title span {
  color: var(--color-text-3);
  font-size: 12px;
}

.update-cell,
.folder-editor-title > div:first-child {
  display: grid;
  gap: 3px;
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
  padding: 0;
}

.folder-editor-title {
  width: 100%;
}

.folder-fields {
  display: grid !important;
  grid-template-columns: minmax(220px, 0.8fr) minmax(300px, 1.2fr);
  width: min(720px, 70%);
  gap: 10px !important;
}

.item-list {
  display: grid;
}

.item-editor {
  display: grid;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border-2);
}

.item-editor:last-child {
  border-bottom: 0;
}

.item-main-fields {
  display: grid;
  grid-template-columns: 1fr 1.4fr 1fr 1fr;
  gap: 10px;
}

.item-policies {
  display: flex;
  align-items: center;
  gap: 16px;
}

.item-policies :deep(.arco-input-number) {
  width: 120px;
}

.readonly-item {
  align-items: flex-start;
}

.readonly-item p {
  margin: 4px 0 0;
  color: var(--color-text-3);
}

@media (max-width: 1100px) {
  .detail-toolbar,
  .folder-editor-title,
  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .folder-fields,
  .item-main-fields {
    width: 100%;
    grid-template-columns: 1fr 1fr;
  }
}
</style>
