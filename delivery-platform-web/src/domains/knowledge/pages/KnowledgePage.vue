<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { IconSearch } from '@arco-design/web-vue/es/icon'
import Message from '@arco-design/web-vue/es/message'
import Modal from '@arco-design/web-vue/es/modal'
import type { TableColumnData } from '@arco-design/web-vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import downloadMetricIcon from '@/assets/figma/standard-library/download.svg'
import eyeMetricIcon from '@/assets/figma/standard-library/eye.svg'
import fileMetricIcon from '@/assets/figma/standard-library/file-text.svg'
import plusIcon from '@/assets/figma/standard-library/plus.svg'
import {
  knowledgeApi,
  type CreateKnowledgeItemPayload,
  type CreateKnowledgeVersionPayload,
  type UpdateKnowledgeVersionPayload,
} from '@/domains/knowledge/api/knowledge.api'
import { BusinessTable } from '@/design-system'
import {
  useKnowledgeCategoryCountsQuery,
  useKnowledgeDetailQuery,
  useKnowledgeListQuery,
  useKnowledgeSummaryQuery,
} from '@/domains/knowledge/queries/useKnowledgeQueries'
import { useFieldConfig } from '@/platform/field-configuration'
import { useFilePreview } from '@/platform/file-preview/useFilePreview'
import { queryKeys } from '@/query/keys'
import { firstRouteParam, preservedRouteQuery } from '@/router/query-state'
import { usePermissionStore } from '@/store/permission'
import type {
  KnowledgeContentType,
  KnowledgeItem,
  KnowledgeItemStatus,
  KnowledgeSupportingFile,
  KnowledgeVersion,
} from '@/domains/knowledge/types/knowledge'
import {
  knowledgeContentPayload,
  validateKnowledgeContent,
} from '@/domains/knowledge/adapters/knowledge-content.adapter'
import { downloadBlob } from '@/utils/blob'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const permissionStore = usePermissionStore()
const filePreview = useFilePreview()
const queryClient = useQueryClient()
const fieldConfig = useFieldConfig('knowledge')

const statusMeta: Record<KnowledgeItemStatus, { label: string; color: string }> = {
  DRAFT: { label: 'knowledge.status.DRAFT', color: 'gray' },
  IN_REVIEW: { label: 'knowledge.status.IN_REVIEW', color: 'orange' },
  REJECTED: { label: 'knowledge.status.REJECTED', color: 'red' },
  PUBLISHED: { label: 'knowledge.status.PUBLISHED', color: 'green' },
  ARCHIVED: { label: 'knowledge.status.ARCHIVED', color: 'arcoblue' },
}

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

type KnowledgeTableColumnKey = 'title' | 'version' | 'effectiveAt' | 'updater' | 'actions'

interface KnowledgeTableColumn {
  key: KnowledgeTableColumnKey
  title: string
  width: number
  headerAlign: 'center'
  contentAlign: 'left' | 'center'
  format: 'title' | 'version' | 'date' | 'person' | 'actions'
  overflow: 'tooltip' | 'clip'
}

const tableColumns = computed<KnowledgeTableColumn[]>(() => [
  {
    key: 'title',
    title: t('knowledge.fields.title'),
    width: 365,
    headerAlign: 'center',
    contentAlign: 'left',
    format: 'title',
    overflow: 'tooltip',
  },
  {
    key: 'version',
    title: t('knowledge.fields.currentVersion'),
    width: 90,
    headerAlign: 'center',
    contentAlign: 'center',
    format: 'version',
    overflow: 'clip',
  },
  {
    key: 'effectiveAt',
    title: t('knowledge.fields.effectiveAt'),
    width: 130,
    headerAlign: 'center',
    contentAlign: 'center',
    format: 'date',
    overflow: 'clip',
  },
  {
    key: 'updater',
    title: t('knowledge.fields.updater'),
    width: 170,
    headerAlign: 'center',
    contentAlign: 'center',
    format: 'person',
    overflow: 'tooltip',
  },
  {
    key: 'actions',
    title: t('common.action'),
    width: 182,
    headerAlign: 'center',
    contentAlign: 'center',
    format: 'actions',
    overflow: 'clip',
  },
])

const versionColumns = computed<TableColumnData[]>(() => [
  { title: t('knowledge.fields.version'), dataIndex: 'version', width: 90 },
  { title: t('knowledge.fields.contentType'), slotName: 'contentType', width: 108 },
  { title: t('knowledge.fields.content'), slotName: 'content', minWidth: 190 },
  { title: t('common.status'), dataIndex: 'status', slotName: 'status', width: 92 },
  {
    title: t('knowledge.fields.changeDescription'),
    dataIndex: 'changeDescription',
    slotName: 'changeDescription',
    minWidth: 170,
  },
  { title: t('knowledge.fields.submitter'), slotName: 'submitter', width: 96 },
  { title: t('knowledge.fields.time'), slotName: 'createdAt', width: 118 },
  { title: t('common.action'), slotName: 'actions', width: 194, fixed: 'right' },
])

const keyword = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '')
const appliedKeyword = ref(keyword.value.trim())
const selectedCategoryId = ref(
  typeof route.query.categoryId === 'string' ? route.query.categoryId : '',
)

function listRouteQuery() {
  return preservedRouteQuery(route.query, ['mode', 'id'])
}

const detailVisible = ref(false)
const selectedDetailId = ref('')
const selectedVersion = ref<KnowledgeVersion | null>(null)

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
const editingVersionId = ref('')
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
const knowledgeDetailQuery = useKnowledgeDetailQuery(selectedDetailId)
const list = computed(() => knowledgeListQuery.data.value?.items ?? [])
const categoryCountMap = computed(
  () =>
    new Map(
      (knowledgeCategoryCountsQuery.data.value ?? []).map((item) => [
        item.categoryId,
        item.count,
      ]),
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
const detail = computed<KnowledgeItem | null>(() => knowledgeDetailQuery.data.value ?? null)
const loading = computed(() => knowledgeListQuery.isFetching.value)
const loadError = computed(() =>
  knowledgeListQuery.isError.value ? t('knowledge.loadFailed') : '',
)
const detailLoading = computed(() => knowledgeDetailQuery.isFetching.value)

const canCreate = computed(() => permissionStore.hasPermission('knowledge:create'))
const canEdit = computed(() => permissionStore.hasPermission('knowledge:update_draft'))
const canSubmitReview = computed(() => permissionStore.hasPermission('knowledge:submit_review'))
const canArchive = computed(() => permissionStore.hasPermission('knowledge:archive'))
const canDownload = computed(() => permissionStore.hasPermission('knowledge:download'))
const hasActiveDraftVersion = computed(() =>
  Boolean(
    detail.value?.versions?.some((version) =>
      ['DRAFT', 'IN_REVIEW', 'REJECTED'].includes(version.status),
    ),
  ),
)

function contentTypeLabel(value: KnowledgeContentType): string {
  const option = contentTypeOptions.find((item) => item.value === value)
  return option ? (option.label === 'Markdown' ? option.label : t(option.label)) : value
}

function statusLabel(value: string): string {
  const meta = statusMeta[value as KnowledgeItemStatus]
  return meta ? t(meta.label) : value
}

function statusColor(value: string): string {
  return statusMeta[value as KnowledgeItemStatus]?.color ?? 'gray'
}

function formatDate(value?: string | null): string {
  return value ? value.slice(0, 10) : '-'
}

function versionFileName(version: KnowledgeVersion): string {
  return version.fileVersion?.asset?.originalName || t('knowledge.defaultFileName')
}

function versionContentLabel(version: KnowledgeVersion): string {
  if (version.contentType === 'FILE') return versionFileName(version)
  if (version.contentType === 'LINK') return version.externalUrl || '-'
  const text = version.markdownContent?.trim()
  return text ? `${text.slice(0, 44)}${text.length > 44 ? '…' : ''}` : '-'
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

function selectCreateFile(event: Event): void {
  createSelectedFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
  createForm.fileVersionId = ''
  if (createSelectedFile.value && !createForm.title.trim()) {
    createForm.title = createSelectedFile.value.name.replace(/\.[^.]+$/u, '')
  }
}

function selectVersionFile(event: Event): void {
  versionSelectedFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
  versionForm.fileVersionId = ''
}

function selectCreateSupportingFiles(event: Event): void {
  createSupportingFiles.value = Array.from((event.target as HTMLInputElement).files ?? [])
}

function selectVersionSupportingFiles(event: Event): void {
  versionSupportingFiles.value = Array.from((event.target as HTMLInputElement).files ?? [])
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

type SaveKnowledgeVersionCommand =
  | { kind: 'create'; itemId: string; data: CreateKnowledgeVersionPayload }
  | {
      kind: 'update'
      itemId: string
      versionId: string
      data: UpdateKnowledgeVersionPayload
    }

const saveVersionMutation = useMutation({
  mutationFn: (command: SaveKnowledgeVersionCommand) =>
    command.kind === 'update'
      ? knowledgeApi.updateVersion(command.versionId, command.data)
      : knowledgeApi.createVersion(command.itemId, command.data),
  retry: false,
  onSuccess: (_, command) => invalidateKnowledge(command.itemId),
})

const submitReviewMutation = useMutation({
  mutationFn: ({ versionId, revision }: { itemId: string; versionId: string; revision: number }) =>
    knowledgeApi.submitReview(versionId, revision),
  retry: false,
  onSuccess: (_, variables) => invalidateKnowledge(variables.itemId),
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
  await router.replace({
    name: 'KnowledgeDetail',
    params: { id: created.id },
    query: listRouteQuery(),
  })
}

async function loadDetail(id: string): Promise<void> {
  detailVisible.value = true
  const isCurrent = selectedDetailId.value === id
  selectedDetailId.value = id
  if (isCurrent) await knowledgeDetailQuery.refetch()
}

function openDetail(row: KnowledgeItem): void {
  void router.push({
    name: 'KnowledgeDetail',
    params: { id: row.id },
    query: listRouteQuery(),
  })
}

function closeDetail(): void {
  detailVisible.value = false
  selectedDetailId.value = ''
  selectedVersion.value = null
  void router.push({ name: 'Knowledge', query: listRouteQuery() })
}

function handleDetailVisibility(visible: boolean): void {
  if (!visible) closeDetail()
}

function openEdit(row?: KnowledgeItem): void {
  const source = row ?? detail.value
  if (!source || !canEdit.value) return
  if (!['DRAFT', 'REJECTED'].includes(source.status)) {
    if (row) openDetail(row)
    return
  }
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
  editingVersionId.value = ''
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

function openEditVersion(version: KnowledgeVersion): void {
  if (!canEdit.value || !['DRAFT', 'REJECTED'].includes(version.status)) return
  editingVersionId.value = version.id
  Object.assign(versionForm, {
    version: version.version,
    contentType: version.contentType,
    fileVersionId: version.fileVersionId ?? '',
    markdownContent: version.markdownContent ?? '',
    externalUrl: version.externalUrl ?? '',
    changeDescription: version.changeDescription ?? '',
    supportingFileVersionIds: version.supportingFiles.map((file) => file.fileVersionId),
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
  if (editingVersionId.value) {
    const revision = detail.value.versions?.find(
      (version) => version.id === editingVersionId.value,
    )?.revision
    if (revision === undefined) return
    await saveVersionMutation.mutateAsync({
      kind: 'update',
      itemId: detail.value.id,
      versionId: editingVersionId.value,
      data: { ...payload, revision },
    })
    Message.success(t('knowledge.messages.versionUpdated'))
  } else {
    await saveVersionMutation.mutateAsync({
      kind: 'create',
      itemId: detail.value.id,
      data: payload,
    })
    Message.success(t('knowledge.messages.versionCreated'))
  }
  versionVisible.value = false
}

function submitReview(version: KnowledgeVersion): void {
  Modal.confirm({
    title: t('knowledge.review.title'),
    content: t('knowledge.review.confirm', { version: version.version }),
    okText: t('knowledge.review.action'),
    cancelText: t('common.cancel'),
    async onOk() {
      if (!detail.value) return
      await submitReviewMutation.mutateAsync({
        itemId: detail.value.id,
        versionId: version.id,
        revision: version.revision,
      })
      Message.success(t('knowledge.messages.reviewSubmitted'))
    },
  })
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
      if (detail.value?.id === row.id) closeDetail()
    },
  })
}

function viewVersion(version: KnowledgeVersion): void {
  selectedVersion.value = version
  if (version.contentType === 'FILE') {
    const logicalFileId = version.fileVersion?.logicalFileId
    if (!logicalFileId) {
      Message.warning(t('knowledge.messages.noPreviewFile'))
      return
    }
    filePreview.openPreview({ id: logicalFileId, title: versionFileName(version) })
  } else if (version.contentType === 'LINK' && version.externalUrl) {
    window.open(version.externalUrl, '_blank', 'noopener,noreferrer')
  }
}

async function downloadVersion(version: KnowledgeVersion): Promise<void> {
  const logicalFileId = version.fileVersion?.logicalFileId
  if (!logicalFileId) {
    Message.warning(t('knowledge.messages.noDownloadFile'))
    return
  }
  const blob = await knowledgeApi.downloadFile(logicalFileId)
  downloadBlob(blob, versionFileName(version))
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

function previewSupportingFile(fileVersionId: string, name: string): void {
  filePreview.openPreview({ id: fileVersionId, title: name })
}

async function downloadSupportingFile(file: KnowledgeSupportingFile): Promise<void> {
  const blob = await knowledgeApi.downloadFile(file.fileVersion.logicalFileId)
  downloadBlob(blob, file.fileVersion.asset.originalName)
}

async function downloadItem(row: KnowledgeItem): Promise<void> {
  const record =
    detail.value?.id === row.id
      ? detail.value
      : await queryClient.ensureQueryData({
          queryKey: queryKeys.knowledge.detail(row.id),
          queryFn: () => knowledgeApi.getById(row.id),
        })
  const version =
    record.versions?.find((item) => item.id === record.currentPublishedVersionId) ??
    record.versions?.find((item) => item.status === 'PUBLISHED')
  if (!version?.fileVersion) {
    Message.warning(t('knowledge.messages.publishedNoDownload'))
    return
  }
  await downloadVersion(version)
}

async function syncRouteIntent(): Promise<void> {
  const mode = typeof route.query.mode === 'string' ? route.query.mode : ''
  const id = firstRouteParam(route.params.id)
  if (id) {
    if (detail.value?.id !== id) await loadDetail(id)
    return
  }

  detailVisible.value = false
  selectedDetailId.value = ''
  selectedVersion.value = null
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
    const configuredDefault = String(
      fieldConfig.getField('KNOWLEDGE_CATEGORY')?.defaultValue ?? '',
    )
    selectedCategoryId.value =
      activeOptions.find((option) => option.value === configuredDefault)?.id ??
      activeOptions[0]?.id ??
      ''
    void syncListRoute()
  },
  { immediate: true },
)

watch(
  () => knowledgeDetailQuery.data.value,
  (record) => {
    if (!record) return
    if (
      !selectedVersion.value ||
      !record.versions?.some((item) => item.id === selectedVersion.value?.id)
    ) {
      selectedVersion.value = record.versions?.[0] ?? null
    }
  },
  { immediate: true },
)

watch(
  () => route.fullPath,
  () => void syncRouteIntent(),
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
          <button
            v-for="category in sidebarCategoryOptions"
            :key="category.id"
            type="button"
            :value="category.id"
            class="knowledge-category"
            :class="{ 'knowledge-category--active': selectedCategoryId === category.id }"
            @click="selectCategory(category.id)"
          >
            <span>{{ category.label }}</span>
            <small>{{ categoryCountMap.get(category.id) ?? 0 }}</small>
          </button>
        </div>
      </aside>

      <div class="knowledge-content-scroll">
        <div class="knowledge-content">
          <header class="knowledge-category-description">
            <h1>{{ selectedCategory?.label || '-' }}</h1>
            <p>{{ selectedCategory?.description || '-' }}</p>
          </header>

          <div class="knowledge-table-region">
            <table class="knowledge-table">
              <colgroup>
                <col
                  v-for="column in tableColumns"
                  :key="column.key"
                  :style="{ width: `${column.width}px` }"
                />
              </colgroup>
              <thead>
                <tr>
                  <th v-for="column in tableColumns" :key="column.key">
                    {{ column.title }}
                  </th>
                </tr>
              </thead>
              <tbody v-if="loadError">
                <tr class="knowledge-table__state-row">
                  <td :colspan="tableColumns.length">
                    <div class="knowledge-table__state">
                      <span>{{ loadError }}</span>
                      <a-button size="mini" @click="fetchList">
                        {{ t('knowledge.retry') }}
                      </a-button>
                    </div>
                  </td>
                </tr>
              </tbody>
              <tbody v-else-if="list.length">
                <tr v-for="record in list" :key="record.id">
                  <td class="knowledge-table__title">
                    <a-tooltip :content="record.title" position="top">
                      <button type="button" @click="openDetail(record)">
                        {{ record.title }}
                      </button>
                    </a-tooltip>
                  </td>
                  <td>{{ record.currentPublishedVersion?.version || '-' }}</td>
                  <td>{{ formatDate(record.effectiveAt) }}</td>
                  <td class="knowledge-table__person">
                    <a-tooltip :content="record.updater?.realName || '-'" position="top">
                      <span>{{ record.updater?.realName || '-' }}</span>
                    </a-tooltip>
                  </td>
                  <td class="knowledge-table__actions">
                    <button
                      v-if="
                        canDownload &&
                          record.currentPublishedVersion?.contentType === 'FILE'
                      "
                      type="button"
                      @click="downloadItem(record)"
                    >
                      {{ t('common.download') }}
                    </button>
                    <button
                      v-else-if="canEdit && record.status !== 'ARCHIVED'"
                      type="button"
                      @click="openEdit(record)"
                    >
                      {{ t('common.edit') }}
                    </button>
                    <button
                      v-if="
                        canArchive &&
                          record.status !== 'ARCHIVED' &&
                          record.status !== 'IN_REVIEW'
                      "
                      type="button"
                      class="knowledge-table__archive"
                      @click="archiveKnowledge(record)"
                    >
                      {{ t('knowledge.archive.actionShort') }}
                    </button>
                  </td>
                </tr>
              </tbody>
              <tbody v-else>
                <tr class="knowledge-table__state-row">
                  <td :colspan="tableColumns.length">
                    <a-empty
                      :description="
                        appliedKeyword || selectedCategoryId
                          ? t('knowledge.emptyFiltered')
                          : t('knowledge.empty')
                      "
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <a-spin
              v-if="loading"
              class="knowledge-table-loading"
              :loading="true"
              :tip="t('common.loading')"
            />
          </div>
        </div>
      </div>
    </section>

    <a-drawer
      :visible="detailVisible"
      width="80vw"
      :title="detail?.title || t('knowledge.detailTitle')"
      :footer="false"
      unmount-on-close
      @update:visible="handleDetailVisibility"
    >
      <a-spin :loading="detailLoading" class="detail-spin">
        <template v-if="detail">
          <div class="detail-command-bar">
            <a-space size="small">
              <a-button
                v-if="canEdit && ['DRAFT', 'REJECTED'].includes(detail.status)"
                size="small"
                @click="openEdit()"
              >
                {{ t('knowledge.editMaster') }}
              </a-button>
              <a-button
                v-if="canEdit && detail.status !== 'ARCHIVED' && !hasActiveDraftVersion"
                size="small"
                type="primary"
                @click="openCreateVersion"
              >
                {{ t('knowledge.createVersion') }}
              </a-button>
              <a-button
                v-if="canArchive && detail.status !== 'ARCHIVED' && detail.status !== 'IN_REVIEW'"
                size="small"
                status="danger"
                @click="archiveKnowledge(detail)"
              >
                {{ t('knowledge.archive.actionShort') }}
              </a-button>
            </a-space>
            <span>{{ t('knowledge.readonlyHint') }}</span>
          </div>

          <a-descriptions
            :column="3"
            bordered
            size="small"
            class="master-detail"
          >
            <a-descriptions-item :label="t('knowledge.fields.category')">
              {{ detail.category?.name || '-' }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('knowledge.fields.contentType')">
              {{ contentTypeLabel(detail.contentType) }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('common.status')">
              <a-tag :color="statusMeta[detail.status].color" size="small">
                {{ t(statusMeta[detail.status].label) }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item :label="t('knowledge.fields.effectiveAt')">
              {{ formatDate(detail.effectiveAt) }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('knowledge.fields.creator')">
              {{ detail.creator?.realName || '-' }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('knowledge.fields.updater')">
              {{ detail.updater?.realName || '-' }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('common.updatedAt')">
              {{ formatDate(detail.updatedAt) }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('knowledge.fields.summary')" :span="3">
              {{ detail.summary || '-' }}
            </a-descriptions-item>
          </a-descriptions>

          <section class="detail-section">
            <header>
              <h2>{{ t('knowledge.versions') }}</h2>
              <span>{{
                t('knowledge.versionCount', { count: detail.versions?.length || 0 })
              }}</span>
            </header>
            <BusinessTable
              :columns="versionColumns"
              :data="detail.versions || []"
              :scroll="{ x: 1100 }"
              row-key="id"
              size="small"
            >
              <template #contentType="{ record }">
                {{ contentTypeLabel(record.contentType) }}
              </template>
              <template #content="{ record }">
                <span class="content-summary">{{ versionContentLabel(record) }}</span>
              </template>
              <template #status="{ record }">
                <a-tag :color="statusColor(record.status)" size="small">
                  {{ statusLabel(record.status) }}
                </a-tag>
              </template>
              <template #changeDescription="{ record }">
                {{ record.changeDescription || '-' }}
              </template>
              <template #submitter="{ record }">
                {{ record.submitter?.realName || '-' }}
              </template>
              <template #createdAt="{ record }">
                {{ formatDate(record.publishedAt || record.createdAt) }}
              </template>
              <template #actions="{ record }">
                <a-space size="mini" :wrap="false">
                  <a-button type="text" size="mini" @click="viewVersion(record)">
                    {{ record.contentType === 'LINK' ? t('knowledge.open') : t('common.view') }}
                  </a-button>
                  <a-button
                    v-if="canEdit && ['DRAFT', 'REJECTED'].includes(record.status)"
                    type="text"
                    size="mini"
                    @click="openEditVersion(record)"
                  >
                    {{ t('knowledge.editDraft') }}
                  </a-button>
                  <a-button
                    v-if="canDownload && record.contentType === 'FILE' && record.fileVersion"
                    type="text"
                    size="mini"
                    @click="downloadVersion(record)"
                  >
                    {{ t('common.download') }}
                  </a-button>
                  <a-button
                    v-if="canSubmitReview && ['DRAFT', 'REJECTED'].includes(record.status)"
                    type="text"
                    status="success"
                    size="mini"
                    @click="submitReview(record)"
                  >
                    {{ t('knowledge.review.action') }}
                  </a-button>
                </a-space>
              </template>
            </BusinessTable>

            <div v-if="selectedVersion?.contentType === 'MARKDOWN'" class="online-content">
              <div>
                <strong>{{ selectedVersion.version }} {{ t('knowledge.markdownBody') }}</strong><span>{{ t('knowledge.readonly') }}</span>
              </div>
              <pre>{{ selectedVersion.markdownContent || t('knowledge.noContent') }}</pre>
            </div>
            <div v-else-if="selectedVersion?.contentType === 'LINK'" class="link-content">
              <strong>{{ selectedVersion.version }} {{ t('knowledge.externalLink') }}</strong>
              <a
                :href="selectedVersion.externalUrl || undefined"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ selectedVersion.externalUrl || t('knowledge.noLink') }}
              </a>
            </div>
            <div v-if="selectedVersion?.supportingFiles.length" class="supporting-files">
              <strong>{{ t('knowledge.supportingFiles') }}</strong>
              <div v-for="file in selectedVersion.supportingFiles" :key="file.id">
                <button
                  type="button"
                  @click="
                    previewSupportingFile(file.fileVersionId, file.fileVersion.asset.originalName)
                  "
                >
                  {{ file.fileVersion.asset.originalName }}
                </button>
                <a-button
                  v-if="canDownload"
                  type="text"
                  size="mini"
                  @click="downloadSupportingFile(file)"
                >
                  {{ t('common.download') }}
                </a-button>
              </div>
            </div>
          </section>
        </template>
      </a-spin>
    </a-drawer>

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
          <label class="file-picker">
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md,.png,.jpg,.jpeg"
              @change="selectCreateFile"
            />
            <span>{{ createSelectedFile?.name || t('knowledge.selectFile') }}</span>
          </label>
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
          <label class="file-picker">
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md,.png,.jpg,.jpeg,.zip"
              @change="selectCreateSupportingFiles"
            />
            <span>
              {{
                createSupportingFiles.length
                  ? t('knowledge.selectedAttachments', { count: createSupportingFiles.length })
                  : t('knowledge.selectSupportingFiles')
              }}
            </span>
          </label>
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
      :title="editingVersionId ? t('knowledge.editVersionDraft') : t('knowledge.createVersion')"
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
          <label class="file-picker">
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md,.png,.jpg,.jpeg"
              @change="selectVersionFile"
            />
            <span>{{
              versionSelectedFile?.name ||
                (versionForm.fileVersionId
                  ? t('knowledge.keepCurrentFile')
                  : t('knowledge.selectFile'))
            }}</span>
          </label>
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
          <label class="file-picker">
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md,.png,.jpg,.jpeg,.zip"
              @change="selectVersionSupportingFiles"
            />
            <span>
              {{
                versionSupportingFiles.length
                  ? t('knowledge.pendingAttachments', { count: versionSupportingFiles.length })
                  : t('knowledge.appendSupportingFiles')
              }}
            </span>
          </label>
        </a-form-item>
      </a-form>
    </a-modal>
  </section>
</template>

<style scoped lang="scss">
.knowledge-library {
  --knowledge-border: #e5e6eb;
  width: 100%;
  min-width: 0;
  min-height: 784px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 13px 13px;
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
  min-width: 936px;
  height: 625px;
  display: flex;
  flex: 0 0 625px;
  overflow: hidden;
  border: 1px solid var(--knowledge-border);
  background: #fff;
  box-sizing: border-box;
}

.knowledge-categories {
  width: 270px;
  height: 100%;
  display: flex;
  flex: 0 0 270px;
  flex-direction: column;
  border-right: 1px solid var(--knowledge-border);
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
  height: 100%;
  flex: 1 1 auto;
  overflow-x: auto;
  overflow-y: hidden;
}

.knowledge-content {
  width: 937px;
  min-width: 937px;
  height: 100%;
}

.knowledge-category-description {
  height: 72px;
  display: flex;
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
  height: 551px;
  overflow: auto;
}

.knowledge-table {
  width: 937px;
  table-layout: fixed;
  border-collapse: collapse;
  color: #1d2129;
  font-size: 13px;
}

.knowledge-table th,
.knowledge-table td {
  height: 44px;
  padding: 0 12px;
  overflow: hidden;
  border-right: 1px solid var(--knowledge-border);
  border-bottom: 1px solid var(--knowledge-border);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box;
}

.knowledge-table th:last-child,
.knowledge-table td:last-child {
  border-right: 0;
}

.knowledge-table th {
  position: sticky;
  z-index: 1;
  top: 0;
  background: #f2f3f5;
  font-weight: 500;
}

.knowledge-table tbody tr:nth-child(even) {
  background: #f7f8fa;
}

.knowledge-table__title {
  text-align: left !important;
}

.knowledge-table__title button {
  width: 100%;
  display: block;
  overflow: hidden;
  padding: 0;
  border: 0;
  color: #165dff;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-weight: 500;
  line-height: 43px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-table__person span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-table__actions button {
  padding: 0;
  border: 0;
  color: #3878f5;
  background: transparent;
  cursor: pointer;
  font: inherit;
}

.knowledge-table__actions button + button {
  margin-left: 24px;
}

.knowledge-table__actions .knowledge-table__archive {
  color: #e33836;
}

.knowledge-table__state-row td {
  height: 506px;
}

.knowledge-table__state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #86909c;
}

.knowledge-table-loading {
  position: absolute;
  z-index: 3;
  inset: 44px 0 0;
  display: grid;
  place-items: center;
  background: rgb(255 255 255 / 72%);
}

.detail-spin {
  min-height: 240px;
  display: block;
}
.detail-command-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.detail-command-bar > span {
  color: var(--color-text-3);
  font-size: 12px;
}
.master-detail {
  margin-bottom: 12px;
}
.detail-section {
  margin-top: 14px;
  border-top: 1px solid var(--color-border-2);
  padding-top: 10px;
}
.detail-section > header {
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.detail-section h2 {
  margin: 0;
  font-size: 14px;
}
.detail-section header > span {
  color: var(--color-text-3);
  font-size: 12px;
}

.online-content,
.link-content {
  margin-top: 8px;
  border: 1px solid var(--color-border-2);
  background: var(--color-fill-1);
}
.online-content > div {
  display: flex;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border-2);
}
.online-content span {
  color: var(--color-text-3);
  font-size: 12px;
}
.online-content pre {
  max-height: 360px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: var(--color-text-2);
  font:
    12px/1.7 Consolas,
    monospace;
  white-space: pre-wrap;
}
.link-content {
  display: grid;
  gap: 6px;
  padding: 10px;
}
.link-content a {
  color: rgb(var(--primary-6));
  overflow-wrap: anywhere;
}
.supporting-files {
  display: grid;
  gap: 7px;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid var(--color-border-2);
  background: var(--color-fill-1);
}
.supporting-files > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.supporting-files button {
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  color: rgb(var(--primary-6));
  background: transparent;
  cursor: pointer;
  text-overflow: ellipsis;
  white-space: nowrap;
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

@media (max-width: 900px) {
  .detail-command-bar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
