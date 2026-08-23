<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { IconSearch } from '@arco-design/web-vue/es/icon'
import Message from '@arco-design/web-vue/es/message'
import Modal from '@arco-design/web-vue/es/modal'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import downloadMetricIcon from '@/assets/figma/standard-library/download.svg'
import eyeMetricIcon from '@/assets/figma/standard-library/eye.svg'
import fileMetricIcon from '@/assets/figma/standard-library/file-text.svg'
import plusIcon from '@/assets/figma/standard-library/plus.svg'
import { BusinessTable } from '@/design-system'
import {
  knowledgeApi,
  type CreateKnowledgeItemPayload,
  type CreateKnowledgeVersionPayload,
} from '@/domains/knowledge/api/knowledge.api'
import {
  useKnowledgeCategoryCountsQuery,
  useKnowledgeListQuery,
  useKnowledgeSummaryQuery,
} from '@/domains/knowledge/queries/useKnowledgeQueries'
import { useFieldConfig } from '@/platform/field-configuration'
import { useFilePreview } from '@/platform/file-preview/useFilePreview'
import { queryKeys } from '@/query/keys'
import { preservedRouteQuery } from '@/router/query-state'
import { usePermissionStore } from '@/store/permission'
import type {
  KnowledgeContentType,
  KnowledgeItem,
} from '@/domains/knowledge/types/knowledge'
import {
  knowledgeContentPayload,
  validateKnowledgeContent,
} from '@/domains/knowledge/adapters/knowledge-content.adapter'
import {
  knowledgeMaterialName,
  selectKnowledgeDisplayVersion,
} from '@/domains/knowledge/utils/knowledge-display'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const permissionStore = usePermissionStore()
const filePreview = useFilePreview()
const queryClient = useQueryClient()
const fieldConfig = useFieldConfig('knowledge')

const contentTypeOptions: Array<{ value: KnowledgeContentType; label: string }> = [
  { value: 'FILE', label: 'knowledge.contentTypes.FILE' },
  { value: 'MARKDOWN', label: 'Markdown' },
  { value: 'LINK', label: 'knowledge.contentTypes.LINK' },
]

const localizedContentTypeOptions = computed(() =>
  contentTypeOptions.map((option) => ({
    ...option,
    label: option.label === 'Markdown' ? option.label : t(option.label),
  })),
)

interface ArcoUploadFileItem {
  file?: File
}

const keyword = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '')
const appliedKeyword = ref(keyword.value.trim())
const selectedCategoryId = ref(
  typeof route.query.categoryId === 'string' ? route.query.categoryId : '',
)

function listRouteQuery() {
  return preservedRouteQuery(route.query, ['mode', 'id'])
}

const detail = ref<KnowledgeItem | null>(null)

const createVisible = ref(false)
const createSelectedFile = ref<File | null>(null)
const createSupportingFiles = ref<File[]>([])
const createForm = reactive({
  title: '',
  categoryId: '',
  summary: '',
  contentType: 'MARKDOWN' as KnowledgeContentType,
  effectiveAt: '',
  version: 'V1.0',
  fileVersionId: '',
  markdownContent: '',
  externalUrl: '',
  changeDescription: t('knowledge.initialVersion'),
  supportingFileVersionIds: [] as string[],
})

const editVisible = ref(false)
const editingItemId = ref('')
const editForm = reactive({
  title: '',
  categoryId: '',
  summary: '',
  effectiveAt: '',
})

const versionVisible = ref(false)
const versionSelectedFile = ref<File | null>(null)
const versionSupportingFiles = ref<File[]>([])
const versionForm = reactive({
  version: '',
  contentType: 'MARKDOWN' as KnowledgeContentType,
  fileVersionId: '',
  markdownContent: '',
  externalUrl: '',
  changeDescription: '',
  supportingFileVersionIds: [] as string[],
})

interface KnowledgeCategoryOption {
  id: string
  value: string
  label: string
  description?: string | null
}

const categoryOptions = computed<KnowledgeCategoryOption[]>(() =>
  fieldConfig.getFieldOptions('KNOWLEDGE_CATEGORY').map((option) => ({
    id: option.id,
    value: option.value,
    label: option.label,
    description: option.description,
  })),
)
const allCategoryOptions = computed<KnowledgeCategoryOption[]>(() =>
  fieldConfig.getFieldOptions('KNOWLEDGE_CATEGORY', true).map((option) => ({
    id: option.id,
    value: option.value,
    label: option.label,
    description: option.description,
  })),
)
const selectedCategory = computed(() =>
  allCategoryOptions.value.find((option) => option.id === selectedCategoryId.value),
)
const formCategoryOptions = computed(() => {
  const options = categoryOptions.value.map((option) => ({
    value: option.id,
    label: option.label,
  }))
  const historicalCategory = detail.value?.category
  if (
    historicalCategory &&
    editForm.categoryId === historicalCategory.id &&
    !options.some((option) => option.value === historicalCategory.id)
  ) {
    options.push({
      value: historicalCategory.id,
      label: `${historicalCategory.name}（已停用）`,
    })
  }
  return options
})
const listParams = computed(() => ({
  page: 1,
  pageSize: 100,
  keyword: appliedKeyword.value || undefined,
  categoryId: selectedCategoryId.value || undefined,
  sortBy: 'updatedAt' as const,
  sortOrder: 'desc' as const,
}))

const knowledgeListQuery = useKnowledgeListQuery(listParams)
const knowledgeSummaryQuery = useKnowledgeSummaryQuery()
const knowledgeCategoryCountsQuery = useKnowledgeCategoryCountsQuery(appliedKeyword)
const list = computed(() => knowledgeListQuery.data.value?.items ?? [])
const categoryCountMap = computed(
  () =>
    new Map(
      (knowledgeCategoryCountsQuery.data.value ?? []).map((item) => [item.categoryId, item.count]),
    ),
)
const sidebarCategoryOptions = computed(() => {
  const activeIds = new Set(categoryOptions.value.map((option) => option.id))
  return allCategoryOptions.value.filter(
    (option) => activeIds.has(option.id) || (categoryCountMap.value.get(option.id) ?? 0) > 0,
  )
})
const summary = computed(
  () =>
    knowledgeSummaryQuery.data.value ?? {
      total: 0,
      viewCount: 0,
      downloadCount: 0,
      draft: 0,
      inReview: 0,
      rejected: 0,
      published: 0,
      archived: 0,
    },
)
const loading = computed(() => knowledgeListQuery.isFetching.value)
const loadError = computed(() =>
  knowledgeListQuery.isError.value ? t('knowledge.loadFailed') : '',
)

const canCreate = computed(() => permissionStore.hasPermission('knowledge:create'))
const canEdit = computed(() => permissionStore.hasPermission('knowledge:update_draft'))
const canArchive = computed(() => permissionStore.hasPermission('knowledge:archive'))

function formatDate(value?: string | null): string {
  return value ? value.slice(0, 10) : '-'
}

async function fetchList(): Promise<void> {
  await knowledgeListQuery.refetch()
}

async function syncListRoute(): Promise<void> {
  await router.replace({
    path: route.path,
    query: {
      ...route.query,
      keyword: appliedKeyword.value || undefined,
      categoryId: selectedCategoryId.value || undefined,
    },
  })
}

function search(): void {
  appliedKeyword.value = keyword.value.trim()
  void syncListRoute()
}

function selectCategory(categoryId: string): void {
  selectedCategoryId.value = categoryId
  void syncListRoute()
}

function resetCreateForm(): void {
  Object.assign(createForm, {
    title: '',
    categoryId: categoryOptions.value[0]?.id ?? '',
    summary: '',
    contentType: 'MARKDOWN',
    effectiveAt: '',
    version: 'V1.0',
    fileVersionId: '',
    markdownContent: '',
    externalUrl: '',
    changeDescription: t('knowledge.initialVersion'),
    supportingFileVersionIds: [],
  })
  createSelectedFile.value = null
  createSupportingFiles.value = []
}

function openCreate(): void {
  if (!canCreate.value) return
  resetCreateForm()
  createVisible.value = true
}

function closeCreate(): void {
  createVisible.value = false
  if (route.query.mode === 'create') {
    void router.replace({ name: 'Knowledge', query: listRouteQuery() })
  }
}

function selectedFiles(fileList: ArcoUploadFileItem[]): File[] {
  return fileList.flatMap((item) => (item.file ? [item.file] : []))
}

function selectCreateFile(fileList: ArcoUploadFileItem[]): void {
  createSelectedFile.value = selectedFiles(fileList).at(-1) ?? null
  createForm.fileVersionId = ''
  if (createSelectedFile.value && !createForm.title.trim()) {
    createForm.title = createSelectedFile.value.name.replace(/\.[^.]+$/u, '')
  }
}

function selectVersionFile(fileList: ArcoUploadFileItem[]): void {
  versionSelectedFile.value = selectedFiles(fileList).at(-1) ?? null
  versionForm.fileVersionId = ''
}

function selectCreateSupportingFiles(fileList: ArcoUploadFileItem[]): void {
  createSupportingFiles.value = selectedFiles(fileList)
}

function selectVersionSupportingFiles(fileList: ArcoUploadFileItem[]): void {
  versionSupportingFiles.value = selectedFiles(fileList)
}

async function uploadSupportingFiles(files: File[], changeDescription: string): Promise<string[]> {
  const uploaded = await uploadDraftMutation.mutateAsync({ files, changeDescription })
  return uploaded.map((item) => item.fileVersionId)
}

function validateContent(
  contentType: KnowledgeContentType,
  fileVersionId: string,
  selectedFile: File | null,
  markdownContent: string,
  externalUrl: string,
): boolean {
  const errorKey = validateKnowledgeContent(
    contentType,
    fileVersionId,
    Boolean(selectedFile),
    markdownContent,
    externalUrl,
  )
  if (errorKey) Message.warning(t(errorKey))
  return !errorKey
}

async function invalidateKnowledge(itemId?: string): Promise<void> {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.lists() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.summary() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.categoryCounts() }),
  ]
  if (itemId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.detail(itemId) }),
    )
  }
  await Promise.all(invalidations)
}

const uploadDraftMutation = useMutation({
  mutationFn: ({ files, changeDescription }: { files: File[]; changeDescription: string }) =>
    Promise.all(files.map((file) => knowledgeApi.uploadDraftFile(file, changeDescription))),
  retry: false,
})

const createKnowledgeMutation = useMutation({
  mutationFn: (data: CreateKnowledgeItemPayload) => knowledgeApi.create(data),
  retry: false,
  onSuccess: (created) => invalidateKnowledge(created.id),
})

const updateKnowledgeMutation = useMutation({
  mutationFn: ({ id, data }: { id: string; data: Parameters<typeof knowledgeApi.update>[1] }) =>
    knowledgeApi.update(id, data),
  retry: false,
  onSuccess: (_, variables) => invalidateKnowledge(variables.id),
})

const saveVersionMutation = useMutation({
  mutationFn: (command: { itemId: string; data: CreateKnowledgeVersionPayload }) =>
    knowledgeApi.createVersion(command.itemId, command.data),
  retry: false,
  onSuccess: (_, command) => invalidateKnowledge(command.itemId),
})

const archiveKnowledgeMutation = useMutation({
  mutationFn: (itemId: string) => knowledgeApi.archive(itemId),
  retry: false,
  onSuccess: (_, itemId) => invalidateKnowledge(itemId),
})

const createSubmitting = computed(
  () => createKnowledgeMutation.isPending.value || uploadDraftMutation.isPending.value,
)
const editSubmitting = computed(() => updateKnowledgeMutation.isPending.value)
const versionSubmitting = computed(
  () => saveVersionMutation.isPending.value || uploadDraftMutation.isPending.value,
)

async function submitCreate(): Promise<void> {
  if (!createForm.title.trim() || !createForm.categoryId) {
    Message.warning(t('knowledge.validation.masterRequired'))
    return
  }
  if (
    !validateContent(
      createForm.contentType,
      createForm.fileVersionId,
      createSelectedFile.value,
      createForm.markdownContent,
      createForm.externalUrl,
    )
  )
    return

  if (createForm.contentType === 'FILE' && createSelectedFile.value && !createForm.fileVersionId) {
    const [uploaded] = await uploadDraftMutation.mutateAsync({
      files: [createSelectedFile.value],
      changeDescription: createForm.changeDescription,
    })
    createForm.fileVersionId = uploaded.fileVersionId
  }
  if (createSupportingFiles.value.length) {
    createForm.supportingFileVersionIds = [
      ...createForm.supportingFileVersionIds,
      ...(await uploadSupportingFiles(createSupportingFiles.value, createForm.changeDescription)),
    ]
  }
  const payload: CreateKnowledgeItemPayload = {
    title: createForm.title.trim(),
    categoryId: createForm.categoryId,
    summary: createForm.summary.trim() || undefined,
    effectiveAt: createForm.effectiveAt || undefined,
    version: createForm.version.trim() || undefined,
    changeDescription: createForm.changeDescription.trim() || undefined,
    supportingFileVersionIds: Array.from(new Set(createForm.supportingFileVersionIds)),
    ...knowledgeContentPayload(
      createForm.contentType,
      createForm.fileVersionId,
      createForm.markdownContent,
      createForm.externalUrl,
    ),
  }
  const created = await createKnowledgeMutation.mutateAsync(payload)
  Message.success(t('knowledge.messages.created'))
  createVisible.value = false
  await router.replace({ name: 'Knowledge', query: listRouteQuery() })
  openKnowledgeMaterial(created)
}

function openKnowledgeMaterial(row: KnowledgeItem): void {
  const version = selectKnowledgeDisplayVersion(row)
  if (!version) {
    Message.warning(t('knowledge.messages.noPreviewFile'))
    return
  }
  if (version.contentType === 'LINK') {
    if (!version.externalUrl) {
      Message.warning(t('knowledge.noLink'))
      return
    }
    window.open(version.externalUrl, '_blank', 'noopener,noreferrer')
    return
  }
  if (version.contentType === 'MARKDOWN') {
    filePreview.openMarkdownPreview({
      content: version.markdownContent ?? '',
      title: knowledgeMaterialName(row),
    })
    return
  }
  const logicalFileId = version.fileVersion?.logicalFileId
  if (!logicalFileId) {
    Message.warning(t('knowledge.messages.noPreviewFile'))
    return
  }
  filePreview.openPreview({ id: logicalFileId, title: knowledgeMaterialName(row) })
}

async function openEdit(source: KnowledgeItem): Promise<void> {
  if (!canEdit.value) return
  if (!['DRAFT', 'REJECTED'].includes(source.status)) {
    if (source.status === 'PUBLISHED') {
      detail.value = await knowledgeApi.getById(source.id)
      openCreateVersion()
    }
    return
  }
  detail.value = source
  editingItemId.value = source.id
  Object.assign(editForm, {
    title: source.title,
    categoryId: source.categoryId,
    summary: source.summary ?? '',
    effectiveAt: source.effectiveAt?.slice(0, 10) ?? '',
  })
  editVisible.value = true
}

async function submitEdit(): Promise<void> {
  if (!editingItemId.value || !editForm.title.trim() || !editForm.categoryId) {
    Message.warning(t('knowledge.validation.masterRequired'))
    return
  }
  await updateKnowledgeMutation.mutateAsync({
    id: editingItemId.value,
    data: {
      title: editForm.title.trim(),
      categoryId: editForm.categoryId,
      summary: editForm.summary.trim() || null,
      effectiveAt: editForm.effectiveAt || null,
    },
  })
  Message.success(t('knowledge.messages.updated'))
  editVisible.value = false
}

function openCreateVersion(): void {
  if (!detail.value || !canEdit.value || detail.value.status === 'ARCHIVED') return
  const source =
    detail.value.versions?.find((item) => item.id === detail.value?.currentPublishedVersionId) ??
    detail.value.versions?.[0]
  Object.assign(versionForm, {
    version: '',
    contentType: source?.contentType ?? detail.value.contentType,
    fileVersionId: source?.fileVersionId ?? '',
    markdownContent: source?.markdownContent ?? '',
    externalUrl: source?.externalUrl ?? '',
    changeDescription: '',
    supportingFileVersionIds: source?.supportingFiles.map((file) => file.fileVersionId) ?? [],
  })
  versionSelectedFile.value = null
  versionSupportingFiles.value = []
  versionVisible.value = true
}

async function submitVersion(): Promise<void> {
  if (!detail.value) return
  if (
    !validateContent(
      versionForm.contentType,
      versionForm.fileVersionId,
      versionSelectedFile.value,
      versionForm.markdownContent,
      versionForm.externalUrl,
    )
  )
    return

  if (versionForm.contentType === 'FILE' && versionSelectedFile.value) {
    const [uploaded] = await uploadDraftMutation.mutateAsync({
      files: [versionSelectedFile.value],
      changeDescription: versionForm.changeDescription,
    })
    versionForm.fileVersionId = uploaded.fileVersionId
  }
  if (versionSupportingFiles.value.length) {
    versionForm.supportingFileVersionIds = [
      ...versionForm.supportingFileVersionIds,
      ...(await uploadSupportingFiles(versionSupportingFiles.value, versionForm.changeDescription)),
    ]
  }
  const payload: CreateKnowledgeVersionPayload = {
    version: versionForm.version.trim() || undefined,
    changeDescription: versionForm.changeDescription.trim() || undefined,
    supportingFileVersionIds: Array.from(new Set(versionForm.supportingFileVersionIds)),
    ...knowledgeContentPayload(
      versionForm.contentType,
      versionForm.fileVersionId,
      versionForm.markdownContent,
      versionForm.externalUrl,
    ),
  }
  await saveVersionMutation.mutateAsync({
    itemId: detail.value.id,
    data: payload,
  })
  Message.success(t('knowledge.messages.versionCreated'))
  versionVisible.value = false
}

function archiveKnowledge(row: KnowledgeItem): void {
  Modal.confirm({
    title: t('knowledge.archive.title'),
    content: t('knowledge.archive.confirm', { title: row.title }),
    okText: t('knowledge.archive.action'),
    cancelText: t('common.cancel'),
    async onOk() {
      await archiveKnowledgeMutation.mutateAsync(row.id)
      Message.success(t('knowledge.messages.archived'))
    },
  })
}

function supportingFileName(fileVersionId: string): string {
  for (const version of detail.value?.versions ?? []) {
    const supporting = version.supportingFiles.find((file) => file.fileVersionId === fileVersionId)
    if (supporting) return supporting.fileVersion.asset.originalName
  }
  return fileVersionId
}

function removeVersionSupportingFile(fileVersionId: string): void {
  versionForm.supportingFileVersionIds = versionForm.supportingFileVersionIds.filter(
    (id) => id !== fileVersionId,
  )
}

function syncRouteIntent(): void {
  const mode = typeof route.query.mode === 'string' ? route.query.mode : ''
  if (mode === 'create' && canCreate.value) {
    if (!createVisible.value) openCreate()
  }
}

watch(
  allCategoryOptions,
  (options) => {
    const activeOptions = categoryOptions.value
    if (!activeOptions.length) return
    if (options.some((option) => option.id === selectedCategoryId.value)) return
    const configuredDefault = String(fieldConfig.getField('KNOWLEDGE_CATEGORY')?.defaultValue ?? '')
    selectedCategoryId.value =
      activeOptions.find((option) => option.value === configuredDefault)?.id ??
      activeOptions[0]?.id ??
      ''
    void syncListRoute()
  },
  { immediate: true },
)

watch(
  () => route.fullPath,
  syncRouteIntent,
  { immediate: true },
)
</script>

<template>
  <section class="knowledge-library">
    <section class="knowledge-metrics" :aria-label="t('knowledge.summary.aria')">
      <article class="knowledge-metric">
        <div class="knowledge-metric__icon">
          <img :src="fileMetricIcon" alt="" />
        </div>
        <div class="knowledge-metric__content">
          <span>{{ t('knowledge.summary.total') }}</span>
          <strong>{{ summary.total }}</strong>
          <small>{{ t('knowledge.summary.itemsUnit') }}</small>
        </div>
      </article>
      <article class="knowledge-metric">
        <div class="knowledge-metric__icon">
          <img :src="eyeMetricIcon" alt="" />
        </div>
        <div class="knowledge-metric__content">
          <span>{{ t('knowledge.summary.views') }}</span>
          <strong>{{ summary.viewCount }}</strong>
          <small>{{ t('knowledge.summary.timesUnit') }}</small>
        </div>
      </article>
      <article class="knowledge-metric">
        <div class="knowledge-metric__icon">
          <img :src="downloadMetricIcon" alt="" />
        </div>
        <div class="knowledge-metric__content">
          <span>{{ t('knowledge.summary.downloads') }}</span>
          <strong>{{ summary.downloadCount }}</strong>
          <small>{{ t('knowledge.summary.timesUnit') }}</small>
        </div>
      </article>
    </section>

    <section class="knowledge-toolbar" :aria-label="t('knowledge.toolbarAria')">
      <a-input
        v-model="keyword"
        class="knowledge-search-input"
        allow-clear
        :placeholder="t('knowledge.searchPlaceholder')"
        @press-enter="search"
      />
      <a-button type="primary" class="knowledge-query-button" @click="search">
        <template #icon>
          <IconSearch />
        </template>
        {{ t('knowledge.query') }}
      </a-button>
      <a-button
        v-if="canCreate"
        type="primary"
        class="knowledge-add-button"
        @click="openCreate"
      >
        <template #icon>
          <img :src="plusIcon" alt="" />
        </template>
        {{ t('knowledge.add') }}
      </a-button>
    </section>

    <section class="knowledge-panel">
      <aside class="knowledge-categories" :aria-label="t('knowledge.categoryHeader')">
        <header class="knowledge-category-header">
          {{ t('knowledge.categoryHeader') }}
        </header>
        <div class="knowledge-category-list">
          <a-button
            v-for="category in sidebarCategoryOptions"
            :key="category.id"
            type="text"
            class="knowledge-category"
            :class="{ 'knowledge-category--active': selectedCategoryId === category.id }"
            v-bind="{ 'data-category-id': category.id }"
            @click="selectCategory(category.id)"
          >
            <span>{{ category.label }}</span>
            <small>{{ categoryCountMap.get(category.id) ?? 0 }}</small>
          </a-button>
        </div>
      </aside>

      <div class="knowledge-content-scroll">
        <div class="knowledge-content">
          <header class="knowledge-category-description">
            <h1>{{ selectedCategory?.label || '-' }}</h1>
            <p>{{ selectedCategory?.description || '-' }}</p>
          </header>

          <div class="knowledge-table-region">
            <BusinessTable
              class="knowledge-table"
              :data="list"
              :loading="loading"
              :error="loadError || null"
              row-key="id"
              size="small"
              bordered
              stripe
              fit-container
              :empty-title="
                appliedKeyword || selectedCategoryId
                  ? t('knowledge.emptyFiltered')
                  : t('knowledge.empty')
              "
              :retry-label="t('knowledge.retry')"
              @retry="fetchList"
            >
              <a-table-column :title="t('knowledge.fields.title')" :min-width="365">
                <template #cell="{ record }">
                  <a-tooltip :content="knowledgeMaterialName(record)" position="top">
                    <a-button
                      type="text"
                      class="knowledge-table__title-button"
                      @click="openKnowledgeMaterial(record)"
                    >
                      {{ knowledgeMaterialName(record) }}
                    </a-button>
                  </a-tooltip>
                </template>
              </a-table-column>
              <a-table-column :title="t('knowledge.fields.currentVersion')" :width="90" align="center">
                <template #cell="{ record }">
                  {{ record.currentPublishedVersion?.version || '-' }}
                </template>
              </a-table-column>
              <a-table-column :title="t('knowledge.fields.effectiveAt')" :width="130" align="center">
                <template #cell="{ record }">
                  {{ formatDate(record.effectiveAt) }}
                </template>
              </a-table-column>
              <a-table-column :title="t('knowledge.fields.updater')" :width="170" align="center">
                <template #cell="{ record }">
                  <a-tooltip :content="record.updater?.realName || '-'" position="top">
                    <span>{{ record.updater?.realName || '-' }}</span>
                  </a-tooltip>
                </template>
              </a-table-column>
              <a-table-column :title="t('common.action')" :width="182" align="center">
                <template #cell="{ record }">
                  <a-space :size="12">
                    <a-button
                      v-if="canEdit && record.status !== 'ARCHIVED'"
                      type="text"
                      size="mini"
                      @click="openEdit(record)"
                    >
                      {{ t('common.edit') }}
                    </a-button>
                    <a-button
                      v-if="
                        canArchive && record.status !== 'ARCHIVED' && record.status !== 'IN_REVIEW'
                      "
                      type="text"
                      size="mini"
                      status="danger"
                      @click="archiveKnowledge(record)"
                    >
                      {{ t('knowledge.archive.actionShort') }}
                    </a-button>
                  </a-space>
                </template>
              </a-table-column>
            </BusinessTable>
          </div>
        </div>
      </div>
    </section>

    <a-modal
      v-model:visible="createVisible"
      :title="t('knowledge.createTitle')"
      :width="860"
      :ok-loading="createSubmitting"
      :ok-text="t('knowledge.saveDraft')"
      :cancel-text="t('common.cancel')"
      @ok="submitCreate"
      @cancel="closeCreate"
    >
      <a-form :model="createForm" layout="vertical">
        <a-grid :cols="2" :col-gap="12" :row-gap="0">
          <a-grid-item>
            <a-form-item :label="t('knowledge.fields.title')" required>
              <a-input v-model="createForm.title" :placeholder="t('knowledge.titlePlaceholder')" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('knowledge.fields.category')" required>
              <a-select
                v-model="createForm.categoryId"
                :options="formCategoryOptions"
                allow-search
                :placeholder="t('knowledge.categoryPlaceholder')"
              />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('knowledge.initialVersionLabel')">
              <a-input v-model="createForm.version" placeholder="V1.0" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('knowledge.fields.effectiveAt')">
              <a-date-picker
                v-model="createForm.effectiveAt"
                format="YYYY-MM-DD"
                style="width: 100%"
              />
            </a-form-item>
          </a-grid-item>
        </a-grid>
        <a-form-item :label="t('knowledge.fields.summary')">
          <a-textarea v-model="createForm.summary" :auto-size="{ minRows: 2, maxRows: 3 }" />
        </a-form-item>
        <a-form-item :label="t('knowledge.fields.changeDescription')">
          <a-input v-model="createForm.changeDescription" />
        </a-form-item>
        <a-form-item :label="t('knowledge.fields.contentType')" required>
          <a-radio-group
            v-model="createForm.contentType"
            type="button"
            size="small"
            :options="localizedContentTypeOptions"
          />
        </a-form-item>
        <a-form-item
          v-if="createForm.contentType === 'FILE'"
          :label="t('knowledge.knowledgeFile')"
          required
          :extra="t('knowledge.fileDraftHint')"
        >
          <a-upload
            :auto-upload="false"
            :limit="1"
            :show-file-list="false"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md,.png,.jpg,.jpeg"
            @change="selectCreateFile"
          >
            <template #upload-button>
              <a-button class="file-picker">
                {{ createSelectedFile?.name || t('knowledge.selectFile') }}
              </a-button>
            </template>
          </a-upload>
        </a-form-item>
        <a-form-item
          v-else-if="createForm.contentType === 'MARKDOWN'"
          :label="t('knowledge.markdownBody')"
          required
        >
          <a-textarea
            v-model="createForm.markdownContent"
            :placeholder="t('knowledge.bodyPlaceholder')"
            :auto-size="{ minRows: 10, maxRows: 16 }"
          />
        </a-form-item>
        <a-form-item v-else :label="t('knowledge.externalLink')" required>
          <a-input v-model="createForm.externalUrl" placeholder="https://example.com/resource" />
        </a-form-item>
        <a-form-item :label="t('knowledge.supportingFiles')" :extra="t('knowledge.supportingHint')">
          <a-upload
            :auto-upload="false"
            multiple
            :show-file-list="false"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md,.png,.jpg,.jpeg,.zip"
            @change="selectCreateSupportingFiles"
          >
            <template #upload-button>
              <a-button class="file-picker">
                {{
                  createSupportingFiles.length
                    ? t('knowledge.selectedAttachments', { count: createSupportingFiles.length })
                    : t('knowledge.selectSupportingFiles')
                }}
              </a-button>
            </template>
          </a-upload>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:visible="editVisible"
      :title="t('knowledge.editMasterTitle')"
      :ok-loading="editSubmitting"
      @ok="submitEdit"
    >
      <a-alert type="info" show-icon class="modal-note">
        {{ t('knowledge.editMasterHint') }}
      </a-alert>
      <a-form :model="editForm" layout="vertical">
        <a-form-item :label="t('knowledge.fields.title')" required>
          <a-input v-model="editForm.title" />
        </a-form-item>
        <a-form-item :label="t('knowledge.fields.category')" required>
          <a-select v-model="editForm.categoryId" :options="formCategoryOptions" allow-search />
        </a-form-item>
        <a-form-item :label="t('knowledge.fields.summary')">
          <a-textarea v-model="editForm.summary" :auto-size="{ minRows: 2, maxRows: 4 }" />
        </a-form-item>
        <a-form-item :label="t('knowledge.fields.effectiveAt')">
          <a-date-picker v-model="editForm.effectiveAt" format="YYYY-MM-DD" style="width: 100%" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:visible="versionVisible"
      :title="t('knowledge.createVersion')"
      :width="760"
      :ok-loading="versionSubmitting"
      :ok-text="t('knowledge.saveVersionDraft')"
      @ok="submitVersion"
    >
      <a-alert type="info" show-icon class="modal-note">
        {{ t('knowledge.versionDraftHint') }}
      </a-alert>
      <a-form :model="versionForm" layout="vertical">
        <a-form-item :label="t('knowledge.fields.version')">
          <a-input
            v-model="versionForm.version"
            :placeholder="t('knowledge.autoVersionPlaceholder')"
          />
        </a-form-item>
        <a-form-item :label="t('knowledge.fields.changeDescription')">
          <a-textarea
            v-model="versionForm.changeDescription"
            :auto-size="{ minRows: 2, maxRows: 3 }"
          />
        </a-form-item>
        <a-form-item :label="t('knowledge.fields.contentType')">
          <a-radio-group
            v-model="versionForm.contentType"
            type="button"
            size="small"
            :options="localizedContentTypeOptions"
          />
        </a-form-item>
        <a-form-item
          v-if="versionForm.contentType === 'FILE'"
          :label="t('knowledge.newVersionFile')"
          required
          :extra="t('knowledge.keepFileHint')"
        >
          <a-upload
            :auto-upload="false"
            :limit="1"
            :show-file-list="false"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md,.png,.jpg,.jpeg"
            @change="selectVersionFile"
          >
            <template #upload-button>
              <a-button class="file-picker">
                {{
                  versionSelectedFile?.name ||
                    (versionForm.fileVersionId
                      ? t('knowledge.keepCurrentFile')
                      : t('knowledge.selectFile'))
                }}
              </a-button>
            </template>
          </a-upload>
        </a-form-item>
        <a-form-item
          v-else-if="versionForm.contentType === 'MARKDOWN'"
          :label="t('knowledge.markdownBody')"
          required
        >
          <a-textarea
            v-model="versionForm.markdownContent"
            :auto-size="{ minRows: 10, maxRows: 16 }"
          />
        </a-form-item>
        <a-form-item v-else :label="t('knowledge.externalLink')" required>
          <a-input v-model="versionForm.externalUrl" />
        </a-form-item>
        <a-form-item
          :label="t('knowledge.supportingFiles')"
          :extra="t('knowledge.versionSupportingHint')"
        >
          <div v-if="versionForm.supportingFileVersionIds.length" class="supporting-tags">
            <a-tag
              v-for="fileVersionId in versionForm.supportingFileVersionIds"
              :key="fileVersionId"
              closable
              @close="removeVersionSupportingFile(fileVersionId)"
            >
              {{ supportingFileName(fileVersionId) }}
            </a-tag>
          </div>
          <a-upload
            :auto-upload="false"
            multiple
            :show-file-list="false"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md,.png,.jpg,.jpeg,.zip"
            @change="selectVersionSupportingFiles"
          >
            <template #upload-button>
              <a-button class="file-picker">
                {{
                  versionSupportingFiles.length
                    ? t('knowledge.pendingAttachments', { count: versionSupportingFiles.length })
                    : t('knowledge.appendSupportingFiles')
                }}
              </a-button>
            </template>
          </a-upload>
        </a-form-item>
      </a-form>
    </a-modal>
  </section>
</template>

<style scoped lang="scss">
.knowledge-library {
  --knowledge-border: #e5e6eb;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  padding: 8px 13px 15px;
  overflow: hidden;
  color: #1d2129;
  background: #fff;
  font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  box-sizing: border-box;
}

.knowledge-metrics {
  height: 88px;
  display: grid;
  flex: 0 0 88px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: 12px;
}

.knowledge-metric {
  height: 76px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  box-sizing: border-box;
}

.knowledge-metric__icon {
  width: 48px;
  height: 48px;
  display: grid;
  flex: 0 0 48px;
  place-items: center;
  border-radius: 2px;
}

.knowledge-metric__icon img {
  width: 32px;
  height: 32px;
}

.knowledge-metric__content {
  min-width: 0;
  display: flex;
  align-items: baseline;
}

.knowledge-metric__content span {
  position: absolute;
  align-self: flex-start;
  color: #999ea8;
  font-size: 12px;
  line-height: 18px;
  transform: translateY(-3px);
}

.knowledge-metric__content strong {
  margin-top: 17px;
  color: #1d2129;
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 28px;
}

.knowledge-metric__content small {
  margin-left: 4px;
  color: #4e5969;
  font-size: 12px;
  line-height: 20px;
}

.knowledge-toolbar {
  height: 32px;
  display: flex;
  flex: 0 0 32px;
  align-items: center;
  gap: 8px;
}

.knowledge-search-input {
  width: 270px;
}

:deep(.knowledge-search-input .arco-input-wrapper) {
  height: 32px;
  border: 0;
  border-radius: 2px;
  background: #f2f3f5;
  box-shadow: none;
}

.knowledge-query-button,
.knowledge-add-button {
  width: 82px;
  height: 32px;
  border-radius: 2px;
  font-size: 13px;
}

.knowledge-add-button {
  margin-left: auto;
}

.knowledge-add-button img {
  width: 16px;
  height: 16px;
  display: block;
}

.knowledge-panel {
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex: 1 1 0;
  gap: 1px;
  overflow: hidden;
  background: var(--knowledge-border);
  box-shadow: inset 0 0 0 1px var(--knowledge-border);
  box-sizing: border-box;
}

.knowledge-categories {
  width: 270px;
  height: 100%;
  display: flex;
  flex: 0 0 270px;
  flex-direction: column;
  background: #fff;
  box-sizing: border-box;
}

.knowledge-category-header {
  height: 44px;
  display: flex;
  flex: 0 0 44px;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--knowledge-border);
  background: #f2f3f5;
  font-size: 13px;
  font-weight: 500;
  box-sizing: border-box;
}

.knowledge-category-list {
  min-height: 0;
  flex: 1 1 0;
  overflow-y: auto;
}

.knowledge-category {
  width: 100%;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border: 0;
  border-bottom: 1px solid var(--knowledge-border);
  color: #1d2129;
  background: #fff;
  cursor: pointer;
  font: inherit;
  text-align: left;
  box-sizing: border-box;
}

.knowledge-category span {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-category small {
  flex: 0 0 auto;
  margin-left: 12px;
  color: #999ea8;
  font-size: 11px;
}

.knowledge-category:hover {
  background: #f7f8fa;
}

.knowledge-category--active,
.knowledge-category--active:hover {
  color: #2563eb;
  background: #e8effc;
}

.knowledge-content-scroll {
  min-width: 0;
  min-height: 0;
  height: 100%;
  flex: 1 1 auto;
  overflow: hidden;
  background: #fff;
}

.knowledge-content {
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.knowledge-category-description {
  height: 72px;
  display: flex;
  flex: 0 0 72px;
  flex-direction: column;
  justify-content: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--knowledge-border);
  box-sizing: border-box;
}

.knowledge-category-description h1,
.knowledge-category-description p {
  margin: 0;
}

.knowledge-category-description h1 {
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}

.knowledge-category-description p {
  overflow: hidden;
  color: #808080;
  font-size: 13px;
  line-height: 22px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-table-region {
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  overflow: auto;
}

.knowledge-table {
  width: 100%;
  min-width: 937px;
  color: #1d2129;
  font-size: 13px;
}

.knowledge-table :deep(.arco-table-th),
.knowledge-table :deep(.arco-table-td) {
  height: 44px;
  overflow: hidden;
  border-right: 1px solid var(--knowledge-border);
  border-bottom: 1px solid var(--knowledge-border);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box;
}

.knowledge-table :deep(.arco-table-cell) {
  padding: 0 12px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.knowledge-table :deep(.arco-table-th:last-child),
.knowledge-table :deep(.arco-table-td:last-child) {
  border-right: 0;
}

.knowledge-table :deep(.arco-table-th) {
  position: sticky;
  z-index: 1;
  top: 0;
  background: #f2f3f5;
  font-weight: 500;
}

.knowledge-table :deep(.knowledge-table__title-button) {
  width: 100%;
  display: block;
  overflow: hidden;
  padding: 0;
  color: #165dff;
  font-weight: 500;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-table :deep(.knowledge-table__title-button:hover),
.knowledge-table :deep(.knowledge-table__title-button:focus-visible) {
  color: #0e42d2;
  text-decoration: underline;
}

.supporting-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.modal-note {
  margin-bottom: 12px;
  border-radius: 0;
}
.file-picker {
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px dashed var(--color-border-3);
  background: var(--color-fill-1);
  cursor: pointer;
}
.file-picker input {
  max-width: 220px;
}
.file-picker span {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-2);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
