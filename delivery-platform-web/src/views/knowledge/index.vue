<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Message, Modal } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import {
  knowledgeApi,
  type CreateKnowledgeItemPayload,
  type CreateKnowledgeVersionPayload,
  type KnowledgePrimaryContentPayload,
  type UpdateKnowledgeVersionPayload,
} from '@/api/knowledge'
import {
  useKnowledgeCategoriesQuery,
  useKnowledgeDetailQuery,
  useKnowledgeListQuery,
  useKnowledgeSummaryQuery,
} from '@/composables/queries/useContentQueries'
import { useFilePreview } from '@/composables/useFilePreview'
import { queryKeys } from '@/query/keys'
import { firstRouteParam, preservedRouteQuery } from '@/router/query-state'
import { usePermissionStore } from '@/store/permission'
import type {
  KnowledgeCategory,
  KnowledgeContentType,
  KnowledgeItem,
  KnowledgeItemStatus,
  KnowledgeSupportingFile,
  KnowledgeVersion,
} from '@/types/knowledge'
import { downloadBlob } from '@/utils/blob'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const permissionStore = usePermissionStore()
const filePreview = useFilePreview()
const queryClient = useQueryClient()

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

const columns = computed<TableColumnData[]>(() => [
  { title: t('knowledge.fields.title'), dataIndex: 'title', slotName: 'title', minWidth: 280 },
  { title: t('knowledge.fields.category'), slotName: 'category', width: 140 },
  {
    title: t('knowledge.fields.contentType'),
    dataIndex: 'contentType',
    slotName: 'contentType',
    width: 108,
  },
  { title: t('knowledge.fields.currentVersion'), slotName: 'version', width: 96 },
  { title: t('common.status'), dataIndex: 'status', slotName: 'status', width: 96 },
  {
    title: t('knowledge.fields.effectiveAt'),
    dataIndex: 'effectiveAt',
    slotName: 'effectiveAt',
    width: 116,
  },
  { title: t('knowledge.fields.updater'), slotName: 'updater', width: 104 },
  { title: t('common.action'), slotName: 'actions', width: 238, fixed: 'right' },
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

const query = reactive({
  page: Number(route.query.page) || 1,
  pageSize: Number(route.query.pageSize) || 20,
  keyword: typeof route.query.keyword === 'string' ? route.query.keyword : '',
  status:
    typeof route.query.status === 'string'
      ? (route.query.status as KnowledgeItemStatus)
      : undefined,
})
const appliedQuery = ref({ ...query })

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

const knowledgeListQuery = useKnowledgeListQuery(appliedQuery)
const knowledgeSummaryQuery = useKnowledgeSummaryQuery()
const knowledgeCategoriesQuery = useKnowledgeCategoriesQuery()
const knowledgeDetailQuery = useKnowledgeDetailQuery(selectedDetailId)
const list = computed(() => knowledgeListQuery.data.value?.items ?? [])
const total = computed(() => knowledgeListQuery.data.value?.total ?? 0)
const categories = computed<KnowledgeCategory[]>(() => knowledgeCategoriesQuery.data.value ?? [])
const summary = computed(
  () =>
    knowledgeSummaryQuery.data.value ?? {
      total: 0,
      draft: 0,
      inReview: 0,
      rejected: 0,
      published: 0,
      archived: 0,
      thisMonthNew: 0,
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

const summaryItems = computed(() => [
  { key: undefined, label: t('knowledge.summary.total'), value: summary.value.total },
  {
    key: 'IN_REVIEW' as KnowledgeItemStatus,
    label: t('knowledge.summary.inReview'),
    value: summary.value.inReview,
  },
  {
    key: 'PUBLISHED' as KnowledgeItemStatus,
    label: t('knowledge.status.PUBLISHED'),
    value: summary.value.published,
  },
  { key: undefined, label: t('knowledge.summary.thisMonth'), value: summary.value.thisMonthNew },
])

const categoryOptions = computed(() => {
  const result: Array<{ value: string; label: string }> = []
  const visit = (items: KnowledgeCategory[] | undefined, prefix = ''): void => {
    for (const category of items ?? []) {
      result.push({ value: category.id, label: `${prefix}${category.name}` })
      visit(category.children, `${prefix}${category.name} / `)
    }
  }
  visit(categories.value)
  return result
})

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
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale.value)
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

async function refreshPage(): Promise<void> {
  await Promise.allSettled([
    knowledgeSummaryQuery.refetch(),
    knowledgeListQuery.refetch(),
    knowledgeCategoriesQuery.refetch(),
  ])
}

async function applyListQuery(): Promise<void> {
  appliedQuery.value = {
    page: query.page,
    pageSize: query.pageSize,
    keyword: query.keyword.trim(),
    status: query.status,
  }
  await router.replace({
    path: route.path,
    query: {
      ...route.query,
      page: query.page === 1 ? undefined : String(query.page),
      pageSize: query.pageSize === 20 ? undefined : String(query.pageSize),
      keyword: query.keyword.trim() || undefined,
      status: query.status,
    },
  })
}

function search(): void {
  query.page = 1
  void applyListQuery()
}

function resetSearch(): void {
  query.keyword = ''
  query.status = undefined
  search()
}

function changePage(page: number): void {
  query.page = page
  void applyListQuery()
}

function selectSummary(status?: KnowledgeItemStatus): void {
  query.status = query.status === status ? undefined : status
  query.page = 1
  void applyListQuery()
}

function resetCreateForm(): void {
  Object.assign(createForm, {
    title: '',
    categoryId: categoryOptions.value[0]?.value ?? '',
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
  if (contentType === 'FILE' && !fileVersionId.trim() && !selectedFile) {
    Message.warning(t('knowledge.validation.fileRequired'))
    return false
  }
  if (contentType === 'MARKDOWN' && !markdownContent.trim()) {
    Message.warning(t('knowledge.validation.markdownRequired'))
    return false
  }
  if (contentType === 'LINK') {
    try {
      const url = new URL(externalUrl)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol')
    } catch {
      Message.warning(t('knowledge.validation.linkInvalid'))
      return false
    }
  }
  return true
}

function contentPayload(
  contentType: KnowledgeContentType,
  fileVersionId: string,
  markdownContent: string,
  externalUrl: string,
): KnowledgePrimaryContentPayload {
  if (contentType === 'FILE') {
    return {
      contentType,
      fileVersionId: fileVersionId.trim(),
      markdownContent: null,
      externalUrl: null,
    }
  }
  if (contentType === 'MARKDOWN') {
    return {
      contentType,
      fileVersionId: null,
      markdownContent: markdownContent.trim(),
      externalUrl: null,
    }
  }
  return {
    contentType,
    fileVersionId: null,
    markdownContent: null,
    externalUrl: externalUrl.trim(),
  }
}

async function invalidateKnowledge(itemId?: string): Promise<void> {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.lists() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.summary() }),
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
    ...contentPayload(
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

function openEdit(): void {
  if (!detail.value || !canEdit.value || !['DRAFT', 'REJECTED'].includes(detail.value.status))
    return
  Object.assign(editForm, {
    title: detail.value.title,
    categoryId: detail.value.categoryId,
    summary: detail.value.summary ?? '',
    effectiveAt: detail.value.effectiveAt?.slice(0, 10) ?? '',
  })
  editVisible.value = true
}

async function submitEdit(): Promise<void> {
  if (!detail.value || !editForm.title.trim() || !editForm.categoryId) {
    Message.warning(t('knowledge.validation.masterRequired'))
    return
  }
  await updateKnowledgeMutation.mutateAsync({
    id: detail.value.id,
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
    ...contentPayload(
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
  <section class="domain-page">
    <header class="page-toolbar">
      <div>
        <h1>{{ t('knowledge.title') }}</h1>
        <p>{{ t('knowledge.subtitle') }}</p>
      </div>
      <a-space size="small">
        <a-button size="small" :loading="loading" @click="refreshPage">
          {{ t('knowledge.refresh') }}
        </a-button>
        <a-button
          v-if="canCreate"
          size="small"
          type="primary"
          @click="openCreate"
        >
          {{ t('knowledge.create') }}
        </a-button>
      </a-space>
    </header>

    <div class="summary-strip" :aria-label="t('knowledge.summary.aria')">
      <button
        v-for="item in summaryItems"
        :key="item.label"
        type="button"
        class="summary-cell"
        :class="{ active: query.status === item.key }"
        @click="selectSummary(item.key)"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </button>
    </div>

    <a-form
      :model="query"
      class="filter-bar"
      layout="inline"
      @submit.prevent="search"
    >
      <a-form-item field="keyword" :label="t('knowledge.keyword')">
        <a-input
          v-model="query.keyword"
          allow-clear
          :placeholder="t('knowledge.searchPlaceholder')"
          style="width: 360px"
          @press-enter="search"
        />
      </a-form-item>
      <a-form-item>
        <a-button type="primary" html-type="submit">
          {{ t('knowledge.query') }}
        </a-button>
        <a-button v-if="query.keyword || query.status" @click="resetSearch">
          {{ t('common.reset') }}
        </a-button>
      </a-form-item>
    </a-form>

    <a-alert
      v-if="loadError"
      type="error"
      :show-icon="true"
      class="load-error"
    >
      {{ loadError }}
      <template #action>
        <a-button size="mini" @click="fetchList">
          {{ t('knowledge.retry') }}
        </a-button>
      </template>
    </a-alert>

    <div class="table-panel">
      <a-table
        :columns="columns"
        :data="list"
        :loading="loading"
        :pagination="false"
        :bordered="{ cell: false }"
        :scroll="{ x: 1240 }"
        row-key="id"
      >
        <template #title="{ record }">
          <button class="record-link" type="button" @click="openDetail(record)">
            <strong>{{ record.title }}</strong>
            <span>{{ record.summary || t('knowledge.noSummary') }}</span>
          </button>
        </template>
        <template #category="{ record }">
          {{ record.category?.name || '-' }}
        </template>
        <template #contentType="{ record }">
          {{ contentTypeLabel(record.contentType) }}
        </template>
        <template #version="{ record }">
          {{ record.currentPublishedVersion?.version || '-' }}
        </template>
        <template #status="{ record }">
          <a-tag :color="statusColor(record.status)" size="small">
            {{ statusLabel(record.status) }}
          </a-tag>
        </template>
        <template #effectiveAt="{ record }">
          {{ formatDate(record.effectiveAt) }}
        </template>
        <template #updater="{ record }">
          {{ record.updater?.realName || '-' }}
        </template>
        <template #actions="{ record }">
          <a-space size="mini" :wrap="false">
            <a-button type="text" size="mini" @click="openDetail(record)">
              {{ t('common.view') }}
            </a-button>
            <a-button
              v-if="canDownload && record.currentPublishedVersion?.contentType === 'FILE'"
              type="text"
              size="mini"
              @click="downloadItem(record)"
            >
              {{ t('common.download') }}
            </a-button>
            <a-button
              v-if="canEdit && record.status !== 'ARCHIVED'"
              type="text"
              size="mini"
              @click="openDetail(record)"
            >
              {{ t('common.edit') }}
            </a-button>
            <a-button
              v-if="canArchive && record.status !== 'ARCHIVED' && record.status !== 'IN_REVIEW'"
              type="text"
              status="danger"
              size="mini"
              @click="archiveKnowledge(record)"
            >
              {{ t('knowledge.archive.actionShort') }}
            </a-button>
          </a-space>
        </template>
        <template #empty>
          <a-empty
            :description="
              query.keyword || query.status ? t('knowledge.emptyFiltered') : t('knowledge.empty')
            "
          />
        </template>
      </a-table>
      <a-pagination
        v-if="total > query.pageSize"
        :current="query.page"
        :page-size="query.pageSize"
        :total="total"
        show-total
        size="small"
        class="pagination"
        @change="changePage"
      />
    </div>

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
                @click="openEdit"
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
            <a-table
              :columns="versionColumns"
              :data="detail.versions || []"
              :pagination="false"
              :bordered="{ cell: false }"
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
            </a-table>

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
                :options="categoryOptions"
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
          <a-select v-model="editForm.categoryId" :options="categoryOptions" allow-search />
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
.domain-page {
  min-height: 100%;
  display: grid;
  align-content: start;
  gap: 8px;
}

.page-toolbar {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 12px;
  border: 1px solid var(--color-border-2);
  background: var(--color-bg-2);

  h1 {
    margin: 0;
    font-size: 17px;
    line-height: 1.4;
  }
  p {
    margin: 2px 0 0;
    color: var(--color-text-3);
    font-size: 12px;
  }
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
}

.summary-cell {
  min-height: 62px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 16px;
  border: 0;
  border-right: 1px solid var(--color-border-2);
  color: var(--color-text-2);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition:
    background-color 160ms ease,
    transform 160ms ease;

  &:last-child {
    border-right: 0;
  }
  &:hover,
  &.active {
    background: rgb(var(--primary-1));
    color: rgb(var(--primary-6));
  }
  &:active {
    transform: scale(0.98);
  }
  span {
    font-size: 12px;
  }
  strong {
    font-size: 22px;
    font-weight: 650;
  }
}

.filter-bar {
  padding: 10px 12px 2px;
  border: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
}
.load-error {
  border-radius: 0;
}
.table-panel {
  min-width: 0;
  border: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
}
.table-panel :deep(.arco-table-th),
.table-panel :deep(.arco-table-cell) {
  padding: 8px 10px;
  font-size: 12px;
}
.pagination {
  display: flex;
  justify-content: flex-end;
  padding: 10px 12px;
  border-top: 1px solid var(--color-border-2);
}

.record-link {
  width: 100%;
  display: grid;
  gap: 2px;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.record-link strong {
  color: rgb(var(--primary-6));
  font-size: 13px;
  font-weight: 600;
}
.record-link span {
  overflow: hidden;
  color: var(--color-text-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.record-link:hover strong {
  text-decoration: underline;
}
.content-summary {
  display: block;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  .page-toolbar,
  .detail-command-bar {
    align-items: flex-start;
    flex-direction: column;
  }
  .summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .summary-cell:nth-child(2) {
    border-right: 0;
  }
  .summary-cell:nth-child(-n + 2) {
    border-bottom: 1px solid var(--color-border-2);
  }
}
</style>
