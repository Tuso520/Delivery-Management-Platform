<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Message, Modal } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { standardApi } from '@/api/standard'
import {
  useStandardDetailQuery,
  useStandardListQuery,
  useStandardRelationsQuery,
  useStandardSummaryQuery,
} from '@/composables/queries/useContentQueries'
import { useFilePreview } from '@/composables/useFilePreview'
import { queryKeys } from '@/query/keys'
import { firstRouteParam, preservedRouteQuery } from '@/router/query-state'
import { usePermissionStore } from '@/store/permission'
import type {
  CreateStandardDto,
  CreateStandardVersionDto,
  Standard,
  StandardRelation,
  StandardRelationType,
  StandardStatus,
  StandardVersion,
} from '@/types/standard'
import { downloadBlob } from '@/utils/blob'

type ContentMode = 'ONLINE' | 'FILE'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const permissionStore = usePermissionStore()
const filePreview = useFilePreview()
const queryClient = useQueryClient()

const statusMeta: Record<StandardStatus, { label: string; color: string }> = {
  DRAFT: { label: 'standard.status.DRAFT', color: 'gray' },
  IN_REVIEW: { label: 'standard.status.IN_REVIEW', color: 'orange' },
  REJECTED: { label: 'standard.status.REJECTED', color: 'red' },
  PUBLISHED: { label: 'standard.status.PUBLISHED', color: 'green' },
  ARCHIVED: { label: 'standard.status.ARCHIVED', color: 'arcoblue' },
}

const standardTypeOptions = [
  { value: 'SOP', label: 'SOP' },
  { value: 'MANAGEMENT_POLICY', label: 'standard.types.MANAGEMENT_POLICY' },
  { value: 'DELIVERY_WORKFLOW', label: 'standard.types.DELIVERY_WORKFLOW' },
  { value: 'CHECK_STANDARD', label: 'standard.types.CHECK_STANDARD' },
  { value: 'DOCUMENT_TEMPLATE', label: 'standard.types.DOCUMENT_TEMPLATE' },
  { value: 'FORM_TEMPLATE', label: 'standard.types.FORM_TEMPLATE' },
  { value: 'TECHNICAL_STANDARD', label: 'standard.types.TECHNICAL_STANDARD' },
  { value: 'WORK_INSTRUCTION', label: 'standard.types.WORK_INSTRUCTION' },
]

const relationTypeOptions: Array<{ value: StandardRelationType; label: string }> = [
  { value: 'SUPPORTING_FORM', label: 'standard.relationTypes.SUPPORTING_FORM' },
  { value: 'SUPPORTING_TEMPLATE', label: 'standard.relationTypes.SUPPORTING_TEMPLATE' },
  { value: 'REFERENCES', label: 'standard.relationTypes.REFERENCES' },
  { value: 'REPLACES', label: 'standard.relationTypes.REPLACES' },
  { value: 'PRECONDITION', label: 'standard.relationTypes.PRECONDITION' },
  { value: 'FOLLOW_UP', label: 'standard.relationTypes.FOLLOW_UP' },
]

const localizedStandardTypeOptions = computed(() =>
  standardTypeOptions.map((option) => ({
    ...option,
    label: option.label === 'SOP' ? option.label : t(option.label),
  })),
)
const localizedRelationTypeOptions = computed(() =>
  relationTypeOptions.map((option) => ({ ...option, label: t(option.label) })),
)

const columns = computed<TableColumnData[]>(() => [
  { title: t('standard.fields.name'), dataIndex: 'name', slotName: 'name', minWidth: 250 },
  { title: t('standard.fields.type'), dataIndex: 'type', slotName: 'type', width: 128 },
  { title: t('standard.fields.currentVersion'), slotName: 'version', width: 96 },
  { title: t('common.status'), dataIndex: 'status', slotName: 'status', width: 96 },
  {
    title: t('standard.fields.effectiveAt'),
    dataIndex: 'effectiveAt',
    slotName: 'effectiveAt',
    width: 116,
  },
  { title: t('standard.fields.updater'), slotName: 'updater', width: 104 },
  { title: t('common.action'), slotName: 'actions', width: 230, fixed: 'right' },
])

const versionColumns = computed<TableColumnData[]>(() => [
  { title: t('standard.fields.version'), dataIndex: 'version', width: 90 },
  { title: t('standard.fields.content'), slotName: 'content', minWidth: 180 },
  { title: t('common.status'), dataIndex: 'status', slotName: 'status', width: 92 },
  {
    title: t('standard.fields.changeDescription'),
    dataIndex: 'changeDescription',
    slotName: 'changeDescription',
    minWidth: 180,
  },
  { title: t('standard.fields.submitter'), slotName: 'submitter', width: 96 },
  { title: t('standard.fields.time'), slotName: 'createdAt', width: 118 },
  { title: t('common.action'), slotName: 'actions', width: 190, fixed: 'right' },
])

const query = reactive({
  page: Number(route.query.page) || 1,
  pageSize: Number(route.query.pageSize) || 20,
  keyword: typeof route.query.keyword === 'string' ? route.query.keyword : '',
  status:
    typeof route.query.status === 'string' ? (route.query.status as StandardStatus) : undefined,
})
const appliedQuery = ref({ ...query })

function listRouteQuery() {
  return preservedRouteQuery(route.query, ['mode', 'id'])
}

const detailVisible = ref(false)
const selectedDetailId = ref('')
const selectedVersion = ref<StandardVersion | null>(null)

const createVisible = ref(false)
const createContentMode = ref<ContentMode>('ONLINE')
const createContent = ref('')
const createSelectedFile = ref<File | null>(null)
const createForm = reactive({
  code: '',
  name: '',
  type: 'SOP',
  category: '',
  effectiveAt: '',
  version: 'V1.0',
  fileVersionId: '',
  changeDescription: t('standard.initialVersion'),
})

const editVisible = ref(false)
const editForm = reactive({
  code: '',
  name: '',
  type: '',
  category: '',
  effectiveAt: '',
})

const versionVisible = ref(false)
const editingVersionId = ref('')
const versionContentMode = ref<ContentMode>('ONLINE')
const versionContent = ref('')
const versionSelectedFile = ref<File | null>(null)
const versionForm = reactive({
  version: '',
  fileVersionId: '',
  effectiveAt: '',
  changeDescription: '',
})

const relationVisible = ref(false)
const relationForm = reactive({
  targetStandardId: '',
  relationType: 'REFERENCES' as StandardRelationType,
})

const standardListQuery = useStandardListQuery(appliedQuery)
const standardSummaryQuery = useStandardSummaryQuery()
const standardDetailQuery = useStandardDetailQuery(selectedDetailId)
const standardRelationsQuery = useStandardRelationsQuery(selectedDetailId)
const relationCandidatesQuery = useStandardListQuery({ page: 1, pageSize: 100 })
const list = computed(() => standardListQuery.data.value?.items ?? [])
const total = computed(() => standardListQuery.data.value?.total ?? 0)
const summary = computed(
  () =>
    standardSummaryQuery.data.value ?? {
      total: 0,
      draft: 0,
      inReview: 0,
      rejected: 0,
      published: 0,
      archived: 0,
    },
)
const detail = computed<Standard | null>(() => standardDetailQuery.data.value ?? null)
const relations = computed<StandardRelation[]>(() => standardRelationsQuery.data.value ?? [])
const relationCandidates = computed(() =>
  (relationCandidatesQuery.data.value?.items ?? []).filter(
    (item) => item.id !== detail.value?.id && item.status !== 'ARCHIVED',
  ),
)
const loading = computed(() => standardListQuery.isFetching.value)
const loadError = computed(() => (standardListQuery.isError.value ? t('standard.loadFailed') : ''))
const detailLoading = computed(
  () => standardDetailQuery.isFetching.value || standardRelationsQuery.isFetching.value,
)

const canCreate = computed(() => permissionStore.hasPermission('standard:create'))
const canEdit = computed(() => permissionStore.hasPermission('standard:update_draft'))
const canSubmitReview = computed(() => permissionStore.hasPermission('standard:submit_review'))
const canArchive = computed(() => permissionStore.hasPermission('standard:archive'))
const canDownload = computed(() => permissionStore.hasPermission('standard:download'))
const hasActiveDraftVersion = computed(() =>
  Boolean(
    detail.value?.versions?.some((version) => ['DRAFT', 'IN_REVIEW'].includes(version.status)),
  ),
)

const summaryItems = computed(() => [
  { key: undefined, label: t('standard.summary.total'), value: summary.value.total },
  {
    key: 'IN_REVIEW' as StandardStatus,
    label: t('standard.summary.inReview'),
    value: summary.value.inReview,
  },
  {
    key: 'PUBLISHED' as StandardStatus,
    label: t('standard.status.PUBLISHED'),
    value: summary.value.published,
  },
  {
    key: 'ARCHIVED' as StandardStatus,
    label: t('standard.status.ARCHIVED'),
    value: summary.value.archived,
  },
])

function typeLabel(value: string): string {
  const option = standardTypeOptions.find((item) => item.value === value)
  return option ? (option.label === 'SOP' ? option.label : t(option.label)) : value
}

function statusLabel(value: string): string {
  const meta = statusMeta[value as StandardStatus]
  return meta ? t(meta.label) : value
}

function statusColor(value: string): string {
  return statusMeta[value as StandardStatus]?.color ?? 'gray'
}

function relationLabel(value: StandardRelationType): string {
  const option = relationTypeOptions.find((item) => item.value === value)
  return option ? t(option.label) : value
}

function formatDate(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale.value)
}

function versionFileName(version: StandardVersion): string {
  return version.fileVersion?.asset?.originalName || t('standard.onlineContent')
}

function versionContentText(version: StandardVersion | null): string {
  if (!version?.structuredContent) return ''
  const markdown = version.structuredContent.markdown
  if (typeof markdown === 'string') return markdown
  return JSON.stringify(version.structuredContent, null, 2)
}

async function fetchList(): Promise<void> {
  await standardListQuery.refetch()
}

async function refreshPage(): Promise<void> {
  await Promise.allSettled([standardSummaryQuery.refetch(), standardListQuery.refetch()])
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

function selectSummary(status?: StandardStatus): void {
  query.status = query.status === status ? undefined : status
  query.page = 1
  void applyListQuery()
}

function resetCreateForm(): void {
  Object.assign(createForm, {
    code: '',
    name: '',
    type: 'SOP',
    category: '',
    effectiveAt: '',
    version: 'V1.0',
    fileVersionId: '',
    changeDescription: t('standard.initialVersion'),
  })
  createContentMode.value = 'ONLINE'
  createContent.value = ''
  createSelectedFile.value = null
}

function openCreate(): void {
  if (!canCreate.value) return
  resetCreateForm()
  createVisible.value = true
}

function closeCreate(): void {
  createVisible.value = false
  if (route.query.mode === 'create') {
    void router.replace({ name: 'Standard', query: listRouteQuery() })
  }
}

function contentPayload(
  mode: ContentMode,
  content: string,
  fileVersionId: string,
): Pick<CreateStandardDto, 'fileVersionId' | 'structuredContent'> {
  if (mode === 'FILE') {
    return { fileVersionId: fileVersionId.trim(), structuredContent: null }
  }
  return { fileVersionId: null, structuredContent: { markdown: content.trim() } }
}

async function invalidateStandard(standardId?: string): Promise<void> {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: queryKeys.standards.lists() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.standards.summary() }),
  ]
  if (standardId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: queryKeys.standards.detail(standardId) }),
    )
  }
  await Promise.all(invalidations)
}

const uploadDraftMutation = useMutation({
  mutationFn: ({ file, changeDescription }: { file: File; changeDescription?: string }) =>
    standardApi.uploadDraftFile(file, changeDescription),
  retry: false,
})

const createStandardMutation = useMutation({
  mutationFn: (data: CreateStandardDto) => standardApi.create(data),
  retry: false,
  onSuccess: (created) => invalidateStandard(created.id),
})

const updateStandardMutation = useMutation({
  mutationFn: ({ id, data }: { id: string; data: Parameters<typeof standardApi.update>[1] }) =>
    standardApi.update(id, data),
  retry: false,
  onSuccess: (_, variables) => invalidateStandard(variables.id),
})

const saveVersionMutation = useMutation({
  mutationFn: ({
    standardId,
    versionId,
    data,
  }: {
    standardId: string
    versionId?: string
    data: CreateStandardVersionDto
  }) =>
    versionId
      ? standardApi.updateVersion(versionId, data)
      : standardApi.createVersion(standardId, data),
  retry: false,
  onSuccess: (_, variables) => invalidateStandard(variables.standardId),
})

const submitReviewMutation = useMutation({
  mutationFn: ({ versionId }: { standardId: string; versionId: string }) =>
    standardApi.submitReview(versionId),
  retry: false,
  onSuccess: (_, variables) => invalidateStandard(variables.standardId),
})

const relationMutation = useMutation({
  mutationFn: async ({
    standardId,
    relationId,
    data,
  }: {
    standardId: string
    relationId?: string
    data?: { targetStandardId: string; relationType: StandardRelationType }
  }) => {
    if (relationId) await standardApi.deleteRelation(standardId, relationId)
    else await standardApi.createRelation(standardId, data!)
  },
  retry: false,
  onSuccess: async (_, variables) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.standards.relations(variables.standardId),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.standards.detail(variables.standardId) }),
    ])
  },
})

const archiveStandardMutation = useMutation({
  mutationFn: (standardId: string) => standardApi.archive(standardId),
  retry: false,
  onSuccess: (_, standardId) => invalidateStandard(standardId),
})

const createSubmitting = computed(
  () => createStandardMutation.isPending.value || uploadDraftMutation.isPending.value,
)
const editSubmitting = computed(() => updateStandardMutation.isPending.value)
const versionSubmitting = computed(
  () => saveVersionMutation.isPending.value || uploadDraftMutation.isPending.value,
)
const relationSubmitting = computed(() => relationMutation.isPending.value)

function selectCreateFile(event: Event): void {
  createSelectedFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
  createForm.fileVersionId = ''
}

function selectVersionFile(event: Event): void {
  versionSelectedFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
  versionForm.fileVersionId = ''
}

async function submitCreate(): Promise<void> {
  if (!createForm.code.trim() || !createForm.name.trim() || !createForm.type) {
    Message.warning(t('standard.validation.masterRequired'))
    return
  }
  if (createContentMode.value === 'ONLINE' && !createContent.value.trim()) {
    Message.warning(t('standard.validation.contentRequired'))
    return
  }
  if (
    createContentMode.value === 'FILE' &&
    !createSelectedFile.value &&
    !createForm.fileVersionId.trim()
  ) {
    Message.warning(t('standard.validation.fileRequired'))
    return
  }

  if (createContentMode.value === 'FILE' && createSelectedFile.value && !createForm.fileVersionId) {
    const uploaded = await uploadDraftMutation.mutateAsync({
      file: createSelectedFile.value,
      changeDescription: createForm.changeDescription,
    })
    createForm.fileVersionId = uploaded.fileVersionId
  }
  const created = await createStandardMutation.mutateAsync({
    code: createForm.code.trim(),
    name: createForm.name.trim(),
    type: createForm.type,
    category: createForm.category.trim() || undefined,
    effectiveAt: createForm.effectiveAt || undefined,
    version: createForm.version.trim() || undefined,
    changeDescription: createForm.changeDescription.trim() || undefined,
    ...contentPayload(createContentMode.value, createContent.value, createForm.fileVersionId),
  })
  Message.success(t('standard.messages.created'))
  createVisible.value = false
  await router.replace({
    name: 'StandardDetail',
    params: { id: created.id },
    query: listRouteQuery(),
  })
}

async function loadDetail(id: string): Promise<void> {
  detailVisible.value = true
  const isCurrent = selectedDetailId.value === id
  selectedDetailId.value = id
  if (isCurrent) {
    await Promise.allSettled([standardDetailQuery.refetch(), standardRelationsQuery.refetch()])
  }
}

function openDetail(row: Standard): void {
  void router.push({
    name: 'StandardDetail',
    params: { id: row.id },
    query: listRouteQuery(),
  })
}

function closeDetail(): void {
  detailVisible.value = false
  selectedDetailId.value = ''
  selectedVersion.value = null
  void router.push({ name: 'Standard', query: listRouteQuery() })
}

function handleDetailVisibility(visible: boolean): void {
  if (!visible) closeDetail()
}

function openEdit(): void {
  if (!detail.value || !canEdit.value || detail.value.status === 'ARCHIVED') return
  Object.assign(editForm, {
    code: detail.value.code,
    name: detail.value.name,
    type: detail.value.type,
    category: detail.value.category ?? '',
    effectiveAt: detail.value.effectiveAt?.slice(0, 10) ?? '',
  })
  editVisible.value = true
}

async function submitEdit(): Promise<void> {
  if (!detail.value || !editForm.code.trim() || !editForm.name.trim()) {
    Message.warning(t('standard.validation.nameRequired'))
    return
  }
  await updateStandardMutation.mutateAsync({
    id: detail.value.id,
    data: {
      code: editForm.code.trim(),
      name: editForm.name.trim(),
      type: editForm.type,
      category: editForm.category.trim() || null,
      effectiveAt: editForm.effectiveAt || null,
    },
  })
  Message.success(t('standard.messages.updated'))
  editVisible.value = false
}

function openCreateVersion(): void {
  if (!detail.value || !canEdit.value || detail.value.status === 'ARCHIVED') return
  const source =
    detail.value.versions?.find((item) => item.id === detail.value?.currentPublishedVersionId) ??
    detail.value.versions?.[0]
  versionContentMode.value = source?.fileVersion ? 'FILE' : 'ONLINE'
  editingVersionId.value = ''
  versionContent.value = versionContentText(source ?? null)
  versionSelectedFile.value = null
  Object.assign(versionForm, {
    version: '',
    fileVersionId: source?.fileVersionId ?? '',
    effectiveAt: source?.effectiveAt?.slice(0, 10) ?? detail.value.effectiveAt?.slice(0, 10) ?? '',
    changeDescription: '',
  })
  versionVisible.value = true
}

function openEditVersion(version: StandardVersion): void {
  if (!canEdit.value || !['DRAFT', 'REJECTED'].includes(version.status)) return
  editingVersionId.value = version.id
  versionContentMode.value = version.fileVersion ? 'FILE' : 'ONLINE'
  versionContent.value = versionContentText(version)
  versionSelectedFile.value = null
  Object.assign(versionForm, {
    version: version.version,
    fileVersionId: version.fileVersionId ?? '',
    effectiveAt: version.effectiveAt?.slice(0, 10) ?? '',
    changeDescription: version.changeDescription ?? '',
  })
  versionVisible.value = true
}

async function submitVersion(): Promise<void> {
  if (!detail.value) return
  if (versionContentMode.value === 'ONLINE' && !versionContent.value.trim()) {
    Message.warning(t('standard.validation.versionContentRequired'))
    return
  }
  if (
    versionContentMode.value === 'FILE' &&
    !versionSelectedFile.value &&
    !versionForm.fileVersionId.trim()
  ) {
    Message.warning(t('standard.validation.versionFileRequired'))
    return
  }
  if (versionContentMode.value === 'FILE' && versionSelectedFile.value) {
    const uploaded = await uploadDraftMutation.mutateAsync({
      file: versionSelectedFile.value,
      changeDescription: versionForm.changeDescription,
    })
    versionForm.fileVersionId = uploaded.fileVersionId
  }
  const payload: CreateStandardVersionDto = {
    revision: editingVersionId.value
      ? detail.value.versions?.find((version) => version.id === editingVersionId.value)?.revision
      : undefined,
    version: versionForm.version.trim() || undefined,
    effectiveAt: versionForm.effectiveAt || null,
    changeDescription: versionForm.changeDescription.trim() || undefined,
    ...contentPayload(versionContentMode.value, versionContent.value, versionForm.fileVersionId),
  }
  await saveVersionMutation.mutateAsync({
    standardId: detail.value.id,
    versionId: editingVersionId.value || undefined,
    data: payload,
  })
  if (editingVersionId.value) {
    Message.success(t('standard.messages.versionUpdated'))
  } else {
    Message.success(t('standard.messages.versionCreated'))
  }
  versionVisible.value = false
}

function submitReview(version: StandardVersion): void {
  Modal.confirm({
    title: t('standard.review.title'),
    content: t('standard.review.confirm', { version: version.version }),
    okText: t('standard.review.action'),
    cancelText: t('common.cancel'),
    async onOk() {
      if (!detail.value) return
      await submitReviewMutation.mutateAsync({
        standardId: detail.value.id,
        versionId: version.id,
      })
      Message.success(t('standard.messages.reviewSubmitted'))
    },
  })
}

async function openRelationCreate(): Promise<void> {
  if (!detail.value || !canEdit.value) return
  relationForm.targetStandardId = ''
  relationForm.relationType = 'REFERENCES'
  relationVisible.value = true
  await relationCandidatesQuery.refetch()
}

async function submitRelation(): Promise<void> {
  if (!detail.value || !relationForm.targetStandardId) {
    Message.warning(t('standard.validation.relationTargetRequired'))
    return
  }
  await relationMutation.mutateAsync({
    standardId: detail.value.id,
    data: { ...relationForm },
  })
  relationVisible.value = false
  Message.success(t('standard.messages.relationAdded'))
}

function removeRelation(relation: StandardRelation): void {
  if (!detail.value) return
  const standardId = detail.value.id
  Modal.confirm({
    title: t('standard.removeRelation.title'),
    content: t('standard.removeRelation.confirm', { name: relation.targetStandard.name }),
    okText: t('standard.removeRelation.action'),
    cancelText: t('common.cancel'),
    async onOk() {
      await relationMutation.mutateAsync({ standardId, relationId: relation.id })
      Message.success(t('standard.messages.relationRemoved'))
    },
  })
}

function archiveStandard(row: Standard): void {
  Modal.confirm({
    title: t('standard.archive.title'),
    content: t('standard.archive.confirm', { name: row.name }),
    okText: t('standard.archive.action'),
    cancelText: t('common.cancel'),
    async onOk() {
      await archiveStandardMutation.mutateAsync(row.id)
      Message.success(t('standard.messages.archived'))
      if (detail.value?.id === row.id) closeDetail()
    },
  })
}

function previewVersion(version: StandardVersion): void {
  const logicalFileId = version.fileVersion?.logicalFileId
  if (!logicalFileId) {
    selectedVersion.value = version
    return
  }
  filePreview.openPreview({
    id: logicalFileId,
    title: versionFileName(version),
  })
}

async function downloadVersion(version: StandardVersion): Promise<void> {
  const logicalFileId = version.fileVersion?.logicalFileId
  if (!logicalFileId) {
    Message.warning(t('standard.messages.onlineNoDownload'))
    return
  }
  const blob = await standardApi.downloadFile(logicalFileId)
  downloadBlob(blob, versionFileName(version))
}

async function downloadStandard(row: Standard): Promise<void> {
  const record =
    detail.value?.id === row.id
      ? detail.value
      : await queryClient.ensureQueryData({
          queryKey: queryKeys.standards.detail(row.id),
          queryFn: () => standardApi.getById(row.id),
        })
  const version =
    record.versions?.find((item) => item.id === record.currentPublishedVersionId) ??
    record.versions?.find((item) => item.status === 'PUBLISHED')
  if (!version?.fileVersion) {
    Message.warning(t('standard.messages.publishedNoDownload'))
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
  () => standardDetailQuery.data.value,
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
        <h1>{{ t('standard.title') }}</h1>
        <p>{{ t('standard.subtitle') }}</p>
      </div>
      <a-space size="small">
        <a-button size="small" :loading="loading" @click="refreshPage">
          {{
            t('standard.refresh')
          }}
        </a-button>
        <a-button
          v-if="canCreate"
          size="small"
          type="primary"
          @click="openCreate"
        >
          {{
            t('standard.create')
          }}
        </a-button>
      </a-space>
    </header>

    <div class="summary-strip" :aria-label="t('standard.summary.aria')">
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
      <a-form-item field="keyword" :label="t('standard.keyword')">
        <a-input
          v-model="query.keyword"
          allow-clear
          :placeholder="t('standard.searchPlaceholder')"
          style="width: 360px"
          @press-enter="search"
        />
      </a-form-item>
      <a-form-item>
        <a-button type="primary" html-type="submit">
          {{ t('standard.query') }}
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
          {{ t('standard.retry') }}
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
        :scroll="{ x: 1120 }"
        row-key="id"
      >
        <template #name="{ record }">
          <button class="record-link" type="button" @click="openDetail(record)">
            <strong>{{ record.name }}</strong>
            <span>{{ record.code
            }}<template v-if="record.category"> · {{ record.category }}</template></span>
          </button>
        </template>
        <template #type="{ record }">
          {{ typeLabel(record.type) }}
        </template>
        <template #version="{ record }">
          {{
            record.currentPublishedVersion?.version || '-'
          }}
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
              {{
                t('common.view')
              }}
            </a-button>
            <a-button
              v-if="canDownload && record.currentPublishedVersion"
              type="text"
              size="mini"
              @click="downloadStandard(record)"
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
              @click="archiveStandard(record)"
            >
              {{ t('standard.archive.actionShort') }}
            </a-button>
          </a-space>
        </template>
        <template #empty>
          <a-empty
            :description="
              query.keyword || query.status ? t('standard.emptyFiltered') : t('standard.empty')
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
      :title="detail ? `${detail.code} · ${detail.name}` : t('standard.detailTitle')"
      :footer="false"
      unmount-on-close
      @update:visible="handleDetailVisibility"
    >
      <a-spin :loading="detailLoading" class="detail-spin">
        <template v-if="detail">
          <div class="detail-command-bar">
            <a-space size="small">
              <a-button
                v-if="canEdit && detail.status !== 'ARCHIVED'"
                size="small"
                @click="openEdit"
              >
                {{ t('standard.editMaster') }}
              </a-button>
              <a-button
                v-if="canEdit && detail.status !== 'ARCHIVED' && !hasActiveDraftVersion"
                size="small"
                type="primary"
                @click="openCreateVersion"
              >
                {{ t('standard.createVersion') }}
              </a-button>
              <a-button
                v-if="canEdit && detail.status !== 'ARCHIVED'"
                size="small"
                @click="openRelationCreate"
              >
                {{ t('standard.addRelation') }}
              </a-button>
              <a-button
                v-if="canArchive && detail.status !== 'ARCHIVED' && detail.status !== 'IN_REVIEW'"
                size="small"
                status="danger"
                @click="archiveStandard(detail)"
              >
                {{ t('standard.archive.actionShort') }}
              </a-button>
            </a-space>
            <span>{{ t('standard.readonlyHint') }}</span>
          </div>

          <a-descriptions
            :column="3"
            bordered
            size="small"
            class="master-detail"
          >
            <a-descriptions-item :label="t('standard.fields.type')">
              {{
                typeLabel(detail.type)
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('standard.fields.category')">
              {{
                detail.category || '-'
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('common.status')">
              <a-tag :color="statusMeta[detail.status].color" size="small">
                {{
                  t(statusMeta[detail.status].label)
                }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item :label="t('standard.fields.effectiveAt')">
              {{
                formatDate(detail.effectiveAt)
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('standard.fields.creator')">
              {{
                detail.creator?.realName || '-'
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('standard.fields.updater')">
              {{
                detail.updater?.realName || '-'
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('common.updatedAt')">
              {{
                formatDate(detail.updatedAt)
              }}
            </a-descriptions-item>
          </a-descriptions>

          <section class="detail-section">
            <header>
              <h2>{{ t('standard.versions') }}</h2>
              <span>{{ t('standard.versionCount', { count: detail.versions?.length || 0 }) }}</span>
            </header>
            <a-table
              :columns="versionColumns"
              :data="detail.versions || []"
              :pagination="false"
              :bordered="{ cell: false }"
              :scroll="{ x: 980 }"
              row-key="id"
              size="small"
            >
              <template #content="{ record }">
                {{ versionFileName(record) }}
              </template>
              <template #status="{ record }">
                <a-tag :color="statusColor(record.status)" size="small">
                  {{ statusLabel(record.status) }}
                </a-tag>
              </template>
              <template #changeDescription="{ record }">
                {{
                  record.changeDescription || '-'
                }}
              </template>
              <template #submitter="{ record }">
                {{ record.submitter?.realName || '-' }}
              </template>
              <template #createdAt="{ record }">
                {{
                  formatDate(record.publishedAt || record.createdAt)
                }}
              </template>
              <template #actions="{ record }">
                <a-space size="mini" :wrap="false">
                  <a-button type="text" size="mini" @click="previewVersion(record)">
                    {{
                      t('common.view')
                    }}
                  </a-button>
                  <a-button
                    v-if="canEdit && ['DRAFT', 'REJECTED'].includes(record.status)"
                    type="text"
                    size="mini"
                    @click="openEditVersion(record)"
                  >
                    {{ t('standard.editDraft') }}
                  </a-button>
                  <a-button
                    v-if="canDownload && record.fileVersion"
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
                    {{ t('standard.review.action') }}
                  </a-button>
                </a-space>
              </template>
            </a-table>
            <div v-if="selectedVersion && !selectedVersion.fileVersion" class="online-content">
              <div>
                <strong>{{ selectedVersion.version }} {{ t('standard.onlineContent') }}</strong><span>{{ t('standard.readonly') }}</span>
              </div>
              <pre>{{ versionContentText(selectedVersion) || t('standard.noContent') }}</pre>
            </div>
          </section>

          <section class="detail-section">
            <header>
              <h2>{{ t('standard.relations') }}</h2>
              <a-button
                v-if="canEdit && detail.status !== 'ARCHIVED'"
                size="mini"
                @click="openRelationCreate"
              >
                {{ t('standard.addRelation') }}
              </a-button>
            </header>
            <div v-if="relations.length" class="relation-list">
              <div v-for="relation in relations" :key="relation.id" class="relation-row">
                <a-tag size="small">
                  {{ relationLabel(relation.relationType) }}
                </a-tag>
                <button type="button" @click="openDetail(relation.targetStandard as Standard)">
                  {{ relation.targetStandard.code }} · {{ relation.targetStandard.name }}
                </button>
                <span>{{ typeLabel(relation.targetStandard.type) }}</span>
                <a-button
                  v-if="canEdit"
                  type="text"
                  status="danger"
                  size="mini"
                  @click="removeRelation(relation)"
                >
                  {{ t('standard.removeRelation.action') }}
                </a-button>
              </div>
            </div>
            <a-empty v-else :description="t('standard.noRelations')" />
          </section>
        </template>
      </a-spin>
    </a-drawer>

    <a-modal
      v-model:visible="createVisible"
      :title="t('standard.create')"
      :width="860"
      :ok-loading="createSubmitting"
      :ok-text="t('standard.saveDraft')"
      :cancel-text="t('common.cancel')"
      @ok="submitCreate"
      @cancel="closeCreate"
    >
      <a-form :model="createForm" layout="vertical">
        <a-grid :cols="2" :col-gap="12" :row-gap="0">
          <a-grid-item>
            <a-form-item
              :label="t('standard.fields.code')"
              required
            >
              <a-input
                v-model="createForm.code"
                :placeholder="t('standard.codePlaceholder')"
              />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item
              :label="t('standard.fields.name')"
              required
            >
              <a-input
                v-model="createForm.name"
                :placeholder="t('standard.namePlaceholder')"
              />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item
              :label="t('standard.fields.type')"
              required
            >
              <a-select
                v-model="createForm.type"
                :options="localizedStandardTypeOptions"
              />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('standard.fields.category')">
              <a-input
                v-model="createForm.category"
                :placeholder="t('standard.optional')"
              />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('standard.initialVersionLabel')">
              <a-input v-model="createForm.version" placeholder="V1.0" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('standard.fields.effectiveAt')">
              <a-date-picker
                v-model="createForm.effectiveAt"
                format="YYYY-MM-DD"
                style="width: 100%"
              />
            </a-form-item>
          </a-grid-item>
        </a-grid>
        <a-form-item :label="t('standard.fields.changeDescription')">
          <a-textarea
            v-model="createForm.changeDescription"
            :auto-size="{ minRows: 2, maxRows: 3 }"
          />
        </a-form-item>
        <a-form-item :label="t('standard.standardContent')" required>
          <a-radio-group v-model="createContentMode" type="button" size="small">
            <a-radio value="ONLINE">
              {{ t('standard.onlineContent') }}
            </a-radio>
            <a-radio value="FILE">
              {{ t('standard.managedFile') }}
            </a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item
          v-if="createContentMode === 'ONLINE'"
          :label="t('standard.contentBody')"
          required
        >
          <a-textarea
            v-model="createContent"
            :placeholder="t('standard.markdownPlaceholder')"
            :auto-size="{ minRows: 8, maxRows: 14 }"
          />
        </a-form-item>
        <a-form-item
          v-else
          :label="t('standard.standardFile')"
          required
          :extra="t('standard.fileDraftHint')"
        >
          <label class="file-picker">
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md,.png,.jpg,.jpeg"
              @change="selectCreateFile"
            />
            <span>{{ createSelectedFile?.name || t('standard.selectFile') }}</span>
          </label>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:visible="editVisible"
      :title="t('standard.editMasterTitle')"
      :ok-loading="editSubmitting"
      @ok="submitEdit"
    >
      <a-alert type="info" show-icon class="modal-note">
        {{ t('standard.editMasterHint') }}
      </a-alert>
      <a-form :model="editForm" layout="vertical">
        <a-form-item
          :label="t('standard.fields.code')"
          required
        >
          <a-input v-model="editForm.code" />
        </a-form-item>
        <a-form-item
          :label="t('standard.fields.name')"
          required
        >
          <a-input v-model="editForm.name" />
        </a-form-item>
        <a-form-item
          :label="t('standard.fields.type')"
          required
        >
          <a-select
            v-model="editForm.type"
            :options="localizedStandardTypeOptions"
          />
        </a-form-item>
        <a-form-item :label="t('standard.fields.category')">
          <a-input v-model="editForm.category" />
        </a-form-item>
        <a-form-item :label="t('standard.fields.effectiveAt')">
          <a-date-picker
            v-model="editForm.effectiveAt"
            format="YYYY-MM-DD"
            style="width: 100%"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:visible="versionVisible"
      :title="editingVersionId ? t('standard.editVersionDraft') : t('standard.createVersion')"
      :width="760"
      :ok-loading="versionSubmitting"
      :ok-text="t('standard.saveVersionDraft')"
      @ok="submitVersion"
    >
      <a-alert type="info" show-icon class="modal-note">
        {{
          t('standard.versionDraftHint')
        }}
      </a-alert>
      <a-form :model="versionForm" layout="vertical">
        <a-grid :cols="2" :col-gap="12">
          <a-grid-item>
            <a-form-item :label="t('standard.fields.version')">
              <a-input
                v-model="versionForm.version"
                :placeholder="t('standard.autoVersionPlaceholder')"
              />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('standard.fields.effectiveAt')">
              <a-date-picker
                v-model="versionForm.effectiveAt"
                format="YYYY-MM-DD"
                style="width: 100%"
              />
            </a-form-item>
          </a-grid-item>
        </a-grid>
        <a-form-item :label="t('standard.fields.changeDescription')">
          <a-textarea
            v-model="versionForm.changeDescription"
            :auto-size="{ minRows: 2, maxRows: 3 }"
          />
        </a-form-item>
        <a-form-item :label="t('standard.contentMode')">
          <a-radio-group v-model="versionContentMode" type="button" size="small">
            <a-radio value="ONLINE">
              {{ t('standard.onlineContent') }}
            </a-radio>
            <a-radio value="FILE">
              {{ t('standard.managedFile') }}
            </a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item
          v-if="versionContentMode === 'ONLINE'"
          :label="t('standard.contentBody')"
          required
        >
          <a-textarea v-model="versionContent" :auto-size="{ minRows: 8, maxRows: 14 }" />
        </a-form-item>
        <a-form-item
          v-else
          :label="t('standard.newVersionFile')"
          required
          :extra="t('standard.newFileHint')"
        >
          <label class="file-picker">
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md,.png,.jpg,.jpeg"
              @change="selectVersionFile"
            />
            <span>{{
              versionSelectedFile?.name ||
                (versionForm.fileVersionId ? t('standard.keepCurrentFile') : t('standard.selectFile'))
            }}</span>
          </label>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:visible="relationVisible"
      :title="t('standard.addRelation')"
      :ok-loading="relationSubmitting"
      @ok="submitRelation"
    >
      <a-form :model="relationForm" layout="vertical">
        <a-form-item
          :label="t('standard.relationType')"
          required
        >
          <a-select
            v-model="relationForm.relationType"
            :options="localizedRelationTypeOptions"
          />
        </a-form-item>
        <a-form-item :label="t('standard.targetStandard')" required>
          <a-select
            v-model="relationForm.targetStandardId"
            allow-search
            :placeholder="t('standard.targetPlaceholder')"
          >
            <a-option
              v-for="item in relationCandidates"
              :key="item.id"
              :value="item.id"
            >
              {{ item.code }} · {{ item.name }}
            </a-option>
          </a-select>
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

  strong {
    color: rgb(var(--primary-6));
    font-size: 13px;
    font-weight: 600;
  }
  span {
    color: var(--color-text-3);
    font-size: 11px;
  }
  &:hover strong {
    text-decoration: underline;
  }
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

.online-content {
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
  max-height: 320px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: var(--color-text-2);
  font:
    12px/1.7 Consolas,
    monospace;
  white-space: pre-wrap;
}

.relation-list {
  border: 1px solid var(--color-border-2);
}
.relation-row {
  min-height: 40px;
  display: grid;
  grid-template-columns: 104px minmax(220px, 1fr) 130px 56px;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-border-2);
}
.relation-row:last-child {
  border-bottom: 0;
}
.relation-row button[type='button'] {
  padding: 0;
  border: 0;
  color: rgb(var(--primary-6));
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.relation-row > span {
  color: var(--color-text-3);
  font-size: 12px;
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
  .relation-row {
    grid-template-columns: 92px minmax(0, 1fr) 56px;
  }
  .relation-row > span {
    display: none;
  }
}
</style>
