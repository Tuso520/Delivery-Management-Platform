<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IconSearch } from '@arco-design/web-vue/es/icon'
import Message from '@arco-design/web-vue/es/message'
import Modal from '@arco-design/web-vue/es/modal'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'

import { standardApi } from '@/api/standard'
import {
  useStandardCategoryCountsQuery,
  useStandardDetailQuery,
  useStandardListQuery,
  useStandardSummaryQuery,
} from '@/composables/queries/useContentQueries'
import downloadMetricIcon from '@/assets/figma/standard-library/download.svg'
import eyeMetricIcon from '@/assets/figma/standard-library/eye.svg'
import fileMetricIcon from '@/assets/figma/standard-library/file-text.svg'
import plusIcon from '@/assets/figma/standard-library/plus.svg'
import { useFieldConfig } from '@/platform/field-configuration'
import { useFilePreview } from '@/platform/file-preview/useFilePreview'
import { queryKeys } from '@/query/keys'
import { firstRouteParam } from '@/router/query-state'
import { usePermissionStore } from '@/store/permission'
import type { FieldOption } from '@/types/field-configuration'
import type {
  CreateStandardDto,
  CreateStandardVersionDto,
  Standard,
  StandardCategoryDimension,
  StandardStatus,
  StandardVersion,
  UpdateStandardDto,
} from '@/types/standard'
import { downloadBlob } from '@/utils/blob'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const queryClient = useQueryClient()
const permissionStore = usePermissionStore()
const filePreview = useFilePreview()
const fieldConfig = useFieldConfig('standard')

const dimension = ref<StandardCategoryDimension>(
  route.query.dimension === 'MANAGEMENT_DOMAIN' ? 'MANAGEMENT_DOMAIN' : 'DELIVERY_STAGE',
)
const keyword = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '')
const appliedKeyword = ref(keyword.value.trim())
const selectedCategoryCode = ref('')
const selectedDetailId = ref('')
const detailVisible = ref(false)
const createVisible = ref(false)
const editVisible = ref(false)
const versionVisible = ref(false)
const editingVersionId = ref('')
const createSelectedFile = ref<File | null>(null)
const versionSelectedFile = ref<File | null>(null)

const categoryFieldCode = computed(() =>
  dimension.value === 'DELIVERY_STAGE'
    ? 'STANDARD_DELIVERY_STAGE'
    : 'STANDARD_MANAGEMENT_DOMAIN',
)
const categoryOptions = computed(() => fieldConfig.getFieldOptions(categoryFieldCode.value))
const selectedCategory = computed<FieldOption | undefined>(() =>
  fieldConfig
    .getFieldOptions(categoryFieldCode.value, true)
    .find((option) => option.value === selectedCategoryCode.value),
)
const categoryCountsQuery = useStandardCategoryCountsQuery(dimension, appliedKeyword)
const categoryCountMap = computed(
  () =>
    new Map(
      (categoryCountsQuery.data.value ?? []).map((item) => [item.code, item.count] as const),
    ),
)

const listParams = computed(() => ({
  page: 1,
  pageSize: 100,
  keyword: appliedKeyword.value || undefined,
  ...(dimension.value === 'DELIVERY_STAGE'
    ? { deliveryStageCode: selectedCategoryCode.value || undefined }
    : { managementDomainCode: selectedCategoryCode.value || undefined }),
  sortBy: 'updatedAt' as const,
  sortOrder: 'desc' as const,
}))
const listQuery = useStandardListQuery(listParams)
const summaryQuery = useStandardSummaryQuery()
const detailQuery = useStandardDetailQuery(selectedDetailId)

const list = computed(() => listQuery.data.value?.items ?? [])
const detail = computed<Standard | null>(() => detailQuery.data.value ?? null)
const loading = computed(() => listQuery.isFetching.value)
const summary = computed(
  () =>
    summaryQuery.data.value ?? {
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

const canCreate = computed(() => permissionStore.hasPermission('standard:create'))
const canEdit = computed(() => permissionStore.hasPermission('standard:update_draft'))
const canSubmitReview = computed(() => permissionStore.hasPermission('standard:submit_review'))
const canArchive = computed(() => permissionStore.hasPermission('standard:archive'))
const canDownload = computed(() => permissionStore.hasPermission('standard:download'))

const createForm = reactive({
  code: '',
  name: '',
  type: '',
  deliveryStageCode: '',
  managementDomainCode: '',
  businessTypeCode: '',
  countryCodes: [] as string[],
  isEnabled: true,
  effectiveAt: '',
  version: '',
  fileVersionId: '',
  changeDescription: '',
})

const editForm = reactive({
  code: '',
  name: '',
  type: '',
  deliveryStageCode: '',
  managementDomainCode: '',
  businessTypeCode: '',
  countryCodes: [] as string[],
  isEnabled: true,
  effectiveAt: '',
})

const versionForm = reactive({
  version: '',
  fileVersionId: '',
  effectiveAt: '',
  changeDescription: '',
})

const typeOptions = computed(() => fieldConfig.getFieldOptions('STANDARD_TYPE'))
const deliveryStageOptions = computed(() =>
  fieldConfig.getFieldOptions('STANDARD_DELIVERY_STAGE'),
)
const managementDomainOptions = computed(() =>
  fieldConfig.getFieldOptions('STANDARD_MANAGEMENT_DOMAIN'),
)
const businessTypeOptions = computed(() =>
  fieldConfig.getFieldOptions('STANDARD_BUSINESS_TYPE'),
)
const countryOptions = computed(() => fieldConfig.getFieldOptions('COUNTRY'))
const hasActiveDraftVersion = computed(() =>
  Boolean(
    detail.value?.versions?.some((version) => ['DRAFT', 'IN_REVIEW'].includes(version.status)),
  ),
)

const createMutation = useMutation({
  mutationFn: (payload: CreateStandardDto) => standardApi.create(payload),
  onSuccess: invalidateStandards,
})
const updateMutation = useMutation({
  mutationFn: ({ id, payload }: { id: string; payload: UpdateStandardDto }) =>
    standardApi.update(id, payload),
  onSuccess: invalidateStandards,
})
const saveVersionMutation = useMutation({
  mutationFn: ({
    standardId,
    versionId,
    payload,
  }: {
    standardId: string
    versionId?: string
    payload: CreateStandardVersionDto
  }) =>
    versionId
      ? standardApi.updateVersion(versionId, payload)
      : standardApi.createVersion(standardId, payload),
  onSuccess: invalidateStandards,
})
const archiveMutation = useMutation({
  mutationFn: (id: string) => standardApi.archive(id),
  onSuccess: invalidateStandards,
})
const submitReviewMutation = useMutation({
  mutationFn: ({ versionId, revision }: { versionId: string; revision: number }) =>
    standardApi.submitReview(versionId, revision),
  onSuccess: invalidateStandards,
})
const uploadMutation = useMutation({
  mutationFn: ({ file, description }: { file: File; description?: string }) =>
    standardApi.uploadDraftFile(file, description),
})

watch(
  [categoryOptions, categoryFieldCode],
  ([options]) => {
    if (options.some((option) => option.value === selectedCategoryCode.value)) return
    const configuredDefault = String(
      fieldConfig.getField(categoryFieldCode.value)?.defaultValue ?? '',
    )
    selectedCategoryCode.value =
      options.find((option) => option.value === configuredDefault)?.value ?? options[0]?.value ?? ''
  },
  { immediate: true },
)

watch(
  () => route.params.id,
  (value) => {
    const id = firstRouteParam(value)
    selectedDetailId.value = id
    detailVisible.value = Boolean(id)
  },
  { immediate: true },
)

async function invalidateStandards(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.standards.all })
}

function fieldName(code: string, fallback: string): string {
  return fieldConfig.getField(code)?.fieldName || fallback
}

function fieldEnabled(code: string): boolean {
  const field = fieldConfig.getField(code)
  return field ? field.enabled : true
}

function optionLabel(code: string, value?: string | null): string {
  return fieldConfig.getFieldLabel(code, value) || value || '-'
}

function statusLabel(status: StandardStatus): string {
  return optionLabel('STANDARD_STATUS', status)
}

function formatDate(value?: string | null): string {
  return value ? value.slice(0, 10) : '-'
}

function currentVersion(row: Standard): string {
  return row.currentPublishedVersion?.version || '-'
}

function effectiveDate(row: Standard): string {
  return formatDate(row.currentPublishedVersion?.effectiveAt || row.effectiveAt)
}

function versionFileName(version: StandardVersion): string {
  return version.fileVersion.asset.originalName
}

function applySearch(): void {
  appliedKeyword.value = keyword.value.trim()
  void router.replace({
    path: route.path,
    query: {
      ...route.query,
      keyword: appliedKeyword.value || undefined,
      dimension: dimension.value === 'MANAGEMENT_DOMAIN' ? dimension.value : undefined,
    },
  })
}

function switchDimension(value: StandardCategoryDimension): void {
  if (dimension.value === value) return
  dimension.value = value
  selectedCategoryCode.value = ''
  void router.replace({
    path: route.path,
    query: {
      ...route.query,
      dimension: value === 'MANAGEMENT_DOMAIN' ? value : undefined,
    },
  })
}

function selectCategory(value: string): void {
  selectedCategoryCode.value = value
}

function defaultValue(code: string, fallback = ''): string {
  return String(fieldConfig.getField(code)?.defaultValue ?? fallback)
}

function resetCreateForm(): void {
  Object.assign(createForm, {
    code: '',
    name: '',
    type: defaultValue('STANDARD_TYPE', typeOptions.value[0]?.value),
    deliveryStageCode: defaultValue(
      'STANDARD_DELIVERY_STAGE',
      deliveryStageOptions.value[0]?.value,
    ),
    managementDomainCode: defaultValue('STANDARD_MANAGEMENT_DOMAIN'),
    businessTypeCode: defaultValue(
      'STANDARD_BUSINESS_TYPE',
      businessTypeOptions.value[0]?.value,
    ),
    countryCodes: [],
    isEnabled: defaultValue('STANDARD_ENABLED_STATUS', 'ENABLED') !== 'DISABLED',
    effectiveAt: '',
    version: defaultValue('STANDARD_CURRENT_VERSION', 'V1.0'),
    fileVersionId: '',
    changeDescription: t('standard.initialVersion'),
  })
  createSelectedFile.value = null
}

function openCreate(): void {
  if (!canCreate.value) return
  resetCreateForm()
  createVisible.value = true
}

function selectCreateFile(event: Event): void {
  createSelectedFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
  createForm.fileVersionId = ''
}

async function submitCreate(): Promise<void> {
  if (
    !createForm.code.trim() ||
    !createForm.name.trim() ||
    !createForm.type ||
    !createForm.deliveryStageCode
  ) {
    Message.warning(t('standard.validation.configuredMasterRequired'))
    return
  }
  if (!createSelectedFile.value) {
    Message.warning(t('standard.validation.fileRequired'))
    return
  }
  const uploaded = await uploadMutation.mutateAsync({
    file: createSelectedFile.value,
    description: createForm.changeDescription.trim() || undefined,
  })
  const created = await createMutation.mutateAsync({
    code: createForm.code.trim(),
    name: createForm.name.trim(),
    type: createForm.type,
    deliveryStageCode: createForm.deliveryStageCode,
    managementDomainCode: createForm.managementDomainCode || undefined,
    businessTypeCode: createForm.businessTypeCode || undefined,
    countryCodes: createForm.countryCodes,
    isEnabled: createForm.isEnabled,
    effectiveAt: createForm.effectiveAt || undefined,
    version: createForm.version.trim() || undefined,
    fileVersionId: uploaded.fileVersionId,
    changeDescription: createForm.changeDescription.trim() || undefined,
  })
  createVisible.value = false
  Message.success(t('standard.messages.created'))
  openDetail(created)
}

async function loadStandard(id: string): Promise<Standard> {
  return queryClient.ensureQueryData({
    queryKey: queryKeys.standards.detail(id),
    queryFn: () => standardApi.getById(id),
  })
}

async function openEdit(row?: Standard): Promise<void> {
  if (!canEdit.value) return
  const record = row ? await loadStandard(row.id) : detail.value
  if (!record || record.status === 'ARCHIVED') return
  selectedDetailId.value = record.id
  Object.assign(editForm, {
    code: record.code,
    name: record.name,
    type: record.type,
    deliveryStageCode: record.deliveryStageCode || '',
    managementDomainCode: record.managementDomainCode || '',
    businessTypeCode: record.businessTypeCode || '',
    countryCodes: [...record.countryCodes],
    isEnabled: record.isEnabled,
    effectiveAt: record.effectiveAt?.slice(0, 10) || '',
  })
  editVisible.value = true
}

async function submitEdit(): Promise<void> {
  if (!selectedDetailId.value) return
  if (!editForm.code.trim() || !editForm.name.trim() || !editForm.deliveryStageCode) {
    Message.warning(t('standard.validation.configuredMasterRequired'))
    return
  }
  await updateMutation.mutateAsync({
    id: selectedDetailId.value,
    payload: {
      code: editForm.code.trim(),
      name: editForm.name.trim(),
      type: editForm.type,
      deliveryStageCode: editForm.deliveryStageCode,
      managementDomainCode: editForm.managementDomainCode || null,
      businessTypeCode: editForm.businessTypeCode || null,
      countryCodes: editForm.countryCodes,
      isEnabled: editForm.isEnabled,
      effectiveAt: editForm.effectiveAt || null,
    },
  })
  editVisible.value = false
  Message.success(t('standard.messages.updated'))
}

function openDetail(row: Standard): void {
  void router.push({ name: 'StandardDetail', params: { id: row.id }, query: route.query })
}

function closeDetail(): void {
  detailVisible.value = false
  selectedDetailId.value = ''
  void router.push({ name: 'Standard', query: route.query })
}

function handleDetailVisible(value: boolean): void {
  if (!value) closeDetail()
}

function openCreateVersion(): void {
  if (!detail.value || !canEdit.value || hasActiveDraftVersion.value) return
  const source =
    detail.value.versions?.find(
      (version) => version.id === detail.value?.currentPublishedVersionId,
    ) ?? detail.value.versions?.[0]
  editingVersionId.value = ''
  versionSelectedFile.value = null
  Object.assign(versionForm, {
    version: '',
    fileVersionId: source?.fileVersionId || '',
    effectiveAt:
      source?.effectiveAt?.slice(0, 10) || detail.value.effectiveAt?.slice(0, 10) || '',
    changeDescription: '',
  })
  versionVisible.value = true
}

function openEditVersion(version: StandardVersion): void {
  if (!canEdit.value || !['DRAFT', 'REJECTED'].includes(version.status)) return
  editingVersionId.value = version.id
  versionSelectedFile.value = null
  Object.assign(versionForm, {
    version: version.version,
    fileVersionId: version.fileVersionId,
    effectiveAt: version.effectiveAt?.slice(0, 10) || '',
    changeDescription: version.changeDescription || '',
  })
  versionVisible.value = true
}

function selectVersionFile(event: Event): void {
  versionSelectedFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
  if (versionSelectedFile.value) versionForm.fileVersionId = ''
}

async function submitVersion(): Promise<void> {
  if (!detail.value) return
  if (versionSelectedFile.value) {
    const uploaded = await uploadMutation.mutateAsync({
      file: versionSelectedFile.value,
      description: versionForm.changeDescription.trim() || undefined,
    })
    versionForm.fileVersionId = uploaded.fileVersionId
  }
  if (!versionForm.fileVersionId) {
    Message.warning(t('standard.validation.versionFileRequired'))
    return
  }
  const current = detail.value.versions?.find(
    (version) => version.id === editingVersionId.value,
  )
  await saveVersionMutation.mutateAsync({
    standardId: detail.value.id,
    versionId: editingVersionId.value || undefined,
    payload: {
      revision: current?.revision,
      version: versionForm.version.trim() || undefined,
      fileVersionId: versionForm.fileVersionId,
      effectiveAt: versionForm.effectiveAt || null,
      changeDescription: versionForm.changeDescription.trim() || undefined,
    },
  })
  versionVisible.value = false
  Message.success(
    editingVersionId.value
      ? t('standard.messages.versionUpdated')
      : t('standard.messages.versionCreated'),
  )
}

function submitReview(version: StandardVersion): void {
  Modal.confirm({
    title: t('standard.review.title'),
    content: t('standard.review.confirm', { version: version.version }),
    okText: t('common.submit'),
    cancelText: t('common.cancel'),
    async onOk() {
      await submitReviewMutation.mutateAsync({
        versionId: version.id,
        revision: version.revision,
      })
      Message.success(t('standard.messages.reviewSubmitted'))
    },
  })
}

function previewVersion(version: StandardVersion): void {
  filePreview.openPreview({
    id: version.fileVersion.logicalFileId,
    title: versionFileName(version),
  })
}

async function downloadVersion(version: StandardVersion): Promise<void> {
  const blob = await standardApi.downloadFile(version.fileVersion.logicalFileId)
  downloadBlob(blob, versionFileName(version))
  await summaryQuery.refetch()
}

async function downloadStandard(row: Standard): Promise<void> {
  const record = detail.value?.id === row.id ? detail.value : await loadStandard(row.id)
  const version =
    record.versions?.find((item) => item.id === record.currentPublishedVersionId) ??
    record.versions?.find((item) => item.status === 'PUBLISHED')
  if (!version) {
    Message.warning(t('standard.messages.publishedNoDownload'))
    return
  }
  await downloadVersion(version)
}

function archiveStandard(row: Standard): void {
  Modal.confirm({
    title: t('standard.archive.title'),
    content: t('standard.archive.confirm', { name: row.name }),
    okText: t('standard.archive.actionShort'),
    cancelText: t('common.cancel'),
    async onOk() {
      await archiveMutation.mutateAsync(row.id)
      Message.success(t('standard.messages.archived'))
      if (detail.value?.id === row.id) closeDetail()
    },
  })
}
</script>

<template>
  <section class="standard-library">
    <div class="metrics">
      <div class="metric">
        <div class="metric__icon">
          <img :src="fileMetricIcon" alt="" />
        </div>
        <div class="metric__content">
          <span>{{ t('standard.summary.total') }}</span>
          <strong>{{ summary.total }}<small>{{ t('standard.units.items') }}</small></strong>
        </div>
      </div>
      <div class="metric">
        <div class="metric__icon">
          <img :src="eyeMetricIcon" alt="" />
        </div>
        <div class="metric__content">
          <span>{{ t('standard.summary.views') }}</span>
          <strong>{{ summary.viewCount }}<small>{{ t('standard.units.times') }}</small></strong>
        </div>
      </div>
      <div class="metric">
        <div class="metric__icon">
          <img :src="downloadMetricIcon" alt="" />
        </div>
        <div class="metric__content">
          <span>{{ t('standard.summary.downloads') }}</span>
          <strong>{{ summary.downloadCount }}<small>{{ t('standard.units.times') }}</small></strong>
        </div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar__left">
        <a-input
          v-model="keyword"
          class="keyword-input"
          :placeholder="t('standard.searchPlaceholder')"
          @press-enter="applySearch"
        />
        <a-button type="primary" class="design-button" @click="applySearch">
          <template #icon>
            <IconSearch />
          </template>
          {{ t('standard.query') }}
        </a-button>
      </div>
      <a-button
        v-if="canCreate"
        type="primary"
        class="design-button"
        @click="openCreate"
      >
        <template #icon>
          <img :src="plusIcon" alt="" class="button-icon" />
        </template>
        {{ t('common.create') }}
      </a-button>
    </div>

    <div class="library-panel">
      <aside class="category-sidebar">
        <div class="category-tabs">
          <button
            type="button"
            :class="{ active: dimension === 'DELIVERY_STAGE' }"
            @click="switchDimension('DELIVERY_STAGE')"
          >
            {{ fieldName('STANDARD_DELIVERY_STAGE', t('standard.fields.deliveryStage')) }}
          </button>
          <button
            type="button"
            :class="{ active: dimension === 'MANAGEMENT_DOMAIN' }"
            @click="switchDimension('MANAGEMENT_DOMAIN')"
          >
            {{ fieldName('STANDARD_MANAGEMENT_DOMAIN', t('standard.fields.managementDomain')) }}
          </button>
        </div>
        <div class="category-list">
          <button
            v-for="option in categoryOptions"
            :key="option.id"
            type="button"
            :class="{ active: selectedCategoryCode === option.value }"
            @click="selectCategory(option.value)"
          >
            <span>{{ option.label }}</span>
            <small>{{ categoryCountMap.get(option.value) ?? 0 }}</small>
          </button>
        </div>
      </aside>

      <div class="content-scroll">
        <div class="content-panel">
          <header class="category-description">
            <h1>{{ selectedCategory?.label || '-' }}</h1>
            <p>{{ selectedCategory?.description || '' }}</p>
          </header>

          <div class="table-region">
            <table class="standard-table">
              <colgroup>
                <col class="column-title" />
                <col v-if="fieldEnabled('STANDARD_CURRENT_VERSION')" class="column-version" />
                <col v-if="fieldEnabled('STANDARD_EFFECTIVE_DATE')" class="column-date" />
                <col class="column-updater" />
                <col class="column-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>{{ t('standard.fields.title') }}</th>
                  <th v-if="fieldEnabled('STANDARD_CURRENT_VERSION')">
                    {{ fieldName('STANDARD_CURRENT_VERSION', t('standard.fields.currentVersion')) }}
                  </th>
                  <th v-if="fieldEnabled('STANDARD_EFFECTIVE_DATE')">
                    {{ fieldName('STANDARD_EFFECTIVE_DATE', t('standard.fields.effectiveAt')) }}
                  </th>
                  <th>{{ t('standard.fields.updater') }}</th>
                  <th>{{ t('common.action') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in list" :key="row.id">
                  <td class="title-cell">
                    <button type="button" :title="row.name" @click="openDetail(row)">
                      {{ row.name }}
                    </button>
                  </td>
                  <td v-if="fieldEnabled('STANDARD_CURRENT_VERSION')" class="center-cell">
                    {{ currentVersion(row) }}
                  </td>
                  <td v-if="fieldEnabled('STANDARD_EFFECTIVE_DATE')" class="center-cell">
                    {{ effectiveDate(row) }}
                  </td>
                  <td class="center-cell">
                    {{ row.updater?.realName || '-' }}
                  </td>
                  <td class="action-cell">
                    <button
                      v-if="!row.currentPublishedVersion && canEdit"
                      type="button"
                      class="action-edit"
                      @click="openEdit(row)"
                    >
                      {{ t('common.edit') }}
                    </button>
                    <button
                      v-else-if="row.currentPublishedVersion && canDownload"
                      type="button"
                      class="action-edit"
                      @click="downloadStandard(row)"
                    >
                      {{ t('common.download') }}
                    </button>
                    <button
                      v-if="canArchive && row.status !== 'IN_REVIEW'"
                      type="button"
                      class="action-archive"
                      @click="archiveStandard(row)"
                    >
                      {{ t('standard.archive.actionShort') }}
                    </button>
                  </td>
                </tr>
                <tr v-if="!loading && !list.length">
                  <td
                    class="empty-cell"
                    :colspan="
                      3 +
                        Number(fieldEnabled('STANDARD_CURRENT_VERSION')) +
                        Number(fieldEnabled('STANDARD_EFFECTIVE_DATE'))
                    "
                  >
                    {{ t('standard.empty') }}
                  </td>
                </tr>
              </tbody>
            </table>
            <a-spin v-if="loading" class="table-loading" />
          </div>
        </div>
      </div>
    </div>

    <a-drawer
      :visible="detailVisible"
      :width="760"
      :title="detail?.name || t('standard.detailTitle')"
      :footer="false"
      unmount-on-close
      @update:visible="handleDetailVisible"
    >
      <a-spin :loading="detailQuery.isFetching.value" class="detail-loading">
        <template v-if="detail">
          <div class="detail-actions">
            <a-button v-if="canEdit && detail.status !== 'ARCHIVED'" @click="openEdit()">
              {{ t('common.edit') }}
            </a-button>
            <a-button
              v-if="canEdit && detail.status !== 'ARCHIVED' && !hasActiveDraftVersion"
              type="primary"
              @click="openCreateVersion"
            >
              {{ t('standard.createVersion') }}
            </a-button>
            <a-button
              v-if="canArchive && detail.status !== 'ARCHIVED' && detail.status !== 'IN_REVIEW'"
              status="danger"
              @click="archiveStandard(detail)"
            >
              {{ t('standard.archive.actionShort') }}
            </a-button>
          </div>
          <a-descriptions :column="2" bordered size="small">
            <a-descriptions-item :label="t('standard.fields.code')">
              {{ detail.code }}
            </a-descriptions-item>
            <a-descriptions-item :label="fieldName('STANDARD_TYPE', t('standard.fields.type'))">
              {{ optionLabel('STANDARD_TYPE', detail.type) }}
            </a-descriptions-item>
            <a-descriptions-item :label="fieldName('STANDARD_DELIVERY_STAGE', t('standard.fields.deliveryStage'))">
              {{ optionLabel('STANDARD_DELIVERY_STAGE', detail.deliveryStageCode) }}
            </a-descriptions-item>
            <a-descriptions-item :label="fieldName('STANDARD_MANAGEMENT_DOMAIN', t('standard.fields.managementDomain'))">
              {{ optionLabel('STANDARD_MANAGEMENT_DOMAIN', detail.managementDomainCode) }}
            </a-descriptions-item>
            <a-descriptions-item :label="fieldName('STANDARD_BUSINESS_TYPE', t('standard.fields.businessType'))">
              {{ optionLabel('STANDARD_BUSINESS_TYPE', detail.businessTypeCode) }}
            </a-descriptions-item>
            <a-descriptions-item :label="fieldName('COUNTRY', t('standard.fields.countries'))">
              {{
                detail.countryCodes.map((code) => optionLabel('COUNTRY', code)).join('、') || '-'
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="fieldName('STANDARD_STATUS', t('common.status'))">
              {{ statusLabel(detail.status) }}
            </a-descriptions-item>
            <a-descriptions-item :label="fieldName('STANDARD_ENABLED_STATUS', t('standard.fields.enabledStatus'))">
              {{
                optionLabel(
                  'STANDARD_ENABLED_STATUS',
                  detail.isEnabled ? 'ENABLED' : 'DISABLED',
                )
              }}
            </a-descriptions-item>
            <a-descriptions-item
              v-if="fieldEnabled('STANDARD_CURRENT_VERSION')"
              :label="fieldName('STANDARD_CURRENT_VERSION', t('standard.fields.currentVersion'))"
            >
              {{ currentVersion(detail) }}
            </a-descriptions-item>
            <a-descriptions-item
              v-if="fieldEnabled('STANDARD_EFFECTIVE_DATE')"
              :label="fieldName('STANDARD_EFFECTIVE_DATE', t('standard.fields.effectiveAt'))"
            >
              {{ effectiveDate(detail) }}
            </a-descriptions-item>
          </a-descriptions>

          <section class="version-section">
            <h2>{{ t('standard.versions') }}</h2>
            <a-table
              :data="detail.versions || []"
              :pagination="false"
              row-key="id"
              size="small"
              :scroll="{ x: 690 }"
            >
              <a-table-column :title="t('standard.fields.version')" data-index="version" :width="80" />
              <a-table-column :title="t('standard.fields.fileName')" :width="210">
                <template #cell="{ record }">
                  <button class="version-link" type="button" @click="previewVersion(record)">
                    {{ versionFileName(record) }}
                  </button>
                </template>
              </a-table-column>
              <a-table-column :title="fieldName('STANDARD_STATUS', t('common.status'))" :width="90">
                <template #cell="{ record }">
                  {{ statusLabel(record.status) }}
                </template>
              </a-table-column>
              <a-table-column
                :title="fieldName('STANDARD_EFFECTIVE_DATE', t('standard.fields.effectiveAt'))"
                :width="110"
              >
                <template #cell="{ record }">
                  {{ formatDate(record.effectiveAt) }}
                </template>
              </a-table-column>
              <a-table-column :title="t('common.action')" :width="190" fixed="right">
                <template #cell="{ record }">
                  <a-space size="mini">
                    <a-button type="text" size="mini" @click="previewVersion(record)">
                      {{ t('common.view') }}
                    </a-button>
                    <a-button
                      v-if="canEdit && ['DRAFT', 'REJECTED'].includes(record.status)"
                      type="text"
                      size="mini"
                      @click="openEditVersion(record)"
                    >
                      {{ t('common.edit') }}
                    </a-button>
                    <a-button
                      v-if="canDownload"
                      type="text"
                      size="mini"
                      @click="downloadVersion(record)"
                    >
                      {{ t('common.download') }}
                    </a-button>
                    <a-button
                      v-if="canSubmitReview && ['DRAFT', 'REJECTED'].includes(record.status)"
                      type="text"
                      size="mini"
                      @click="submitReview(record)"
                    >
                      {{ t('common.submit') }}
                    </a-button>
                  </a-space>
                </template>
              </a-table-column>
            </a-table>
          </section>
        </template>
      </a-spin>
    </a-drawer>

    <a-modal
      v-model:visible="createVisible"
      :title="t('standard.create')"
      :width="820"
      :ok-loading="createMutation.isPending.value || uploadMutation.isPending.value"
      @ok="submitCreate"
    >
      <a-form :model="createForm" layout="vertical">
        <a-grid :cols="2" :col-gap="12">
          <a-grid-item>
            <a-form-item :label="t('standard.fields.code')" required>
              <a-input v-model="createForm.code" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('standard.fields.title')" required>
              <a-input v-model="createForm.name" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item v-if="fieldEnabled('STANDARD_TYPE')">
            <a-form-item :label="fieldName('STANDARD_TYPE', t('standard.fields.type'))" required>
              <a-select v-model="createForm.type" :options="typeOptions" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item v-if="fieldEnabled('STANDARD_DELIVERY_STAGE')">
            <a-form-item :label="fieldName('STANDARD_DELIVERY_STAGE', t('standard.fields.deliveryStage'))" required>
              <a-select v-model="createForm.deliveryStageCode" :options="deliveryStageOptions" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item v-if="fieldEnabled('STANDARD_MANAGEMENT_DOMAIN')">
            <a-form-item :label="fieldName('STANDARD_MANAGEMENT_DOMAIN', t('standard.fields.managementDomain'))">
              <a-select
                v-model="createForm.managementDomainCode"
                :options="managementDomainOptions"
                allow-clear
              />
            </a-form-item>
          </a-grid-item>
          <a-grid-item v-if="fieldEnabled('STANDARD_BUSINESS_TYPE')">
            <a-form-item :label="fieldName('STANDARD_BUSINESS_TYPE', t('standard.fields.businessType'))">
              <a-select
                v-model="createForm.businessTypeCode"
                :options="businessTypeOptions"
                allow-clear
              />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="fieldName('COUNTRY', t('standard.fields.countries'))">
              <a-select v-model="createForm.countryCodes" :options="countryOptions" multiple />
            </a-form-item>
          </a-grid-item>
          <a-grid-item v-if="fieldEnabled('STANDARD_CURRENT_VERSION')">
            <a-form-item :label="fieldName('STANDARD_CURRENT_VERSION', t('standard.fields.currentVersion'))">
              <a-input v-model="createForm.version" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item v-if="fieldEnabled('STANDARD_EFFECTIVE_DATE')">
            <a-form-item :label="fieldName('STANDARD_EFFECTIVE_DATE', t('standard.fields.effectiveAt'))">
              <a-date-picker v-model="createForm.effectiveAt" style="width: 100%" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item v-if="fieldEnabled('STANDARD_ENABLED_STATUS')">
            <a-form-item :label="fieldName('STANDARD_ENABLED_STATUS', t('standard.fields.enabledStatus'))">
              <a-switch v-model="createForm.isEnabled" />
            </a-form-item>
          </a-grid-item>
        </a-grid>
        <a-form-item :label="t('standard.fields.changeDescription')">
          <a-textarea v-model="createForm.changeDescription" />
        </a-form-item>
        <a-form-item :label="t('standard.standardFile')" required>
          <label class="file-picker">
            <input type="file" @change="selectCreateFile" />
            <span>{{ createSelectedFile?.name || t('standard.selectFile') }}</span>
          </label>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:visible="editVisible"
      :title="t('standard.editMasterTitle')"
      :width="820"
      :ok-loading="updateMutation.isPending.value"
      @ok="submitEdit"
    >
      <a-form :model="editForm" layout="vertical">
        <a-grid :cols="2" :col-gap="12">
          <a-grid-item>
            <a-form-item :label="t('standard.fields.code')" required>
              <a-input v-model="editForm.code" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('standard.fields.title')" required>
              <a-input v-model="editForm.name" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item v-if="fieldEnabled('STANDARD_TYPE')">
            <a-form-item :label="fieldName('STANDARD_TYPE', t('standard.fields.type'))" required>
              <a-select v-model="editForm.type" :options="typeOptions" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item v-if="fieldEnabled('STANDARD_DELIVERY_STAGE')">
            <a-form-item :label="fieldName('STANDARD_DELIVERY_STAGE', t('standard.fields.deliveryStage'))" required>
              <a-select v-model="editForm.deliveryStageCode" :options="deliveryStageOptions" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item v-if="fieldEnabled('STANDARD_MANAGEMENT_DOMAIN')">
            <a-form-item :label="fieldName('STANDARD_MANAGEMENT_DOMAIN', t('standard.fields.managementDomain'))">
              <a-select
                v-model="editForm.managementDomainCode"
                :options="managementDomainOptions"
                allow-clear
              />
            </a-form-item>
          </a-grid-item>
          <a-grid-item v-if="fieldEnabled('STANDARD_BUSINESS_TYPE')">
            <a-form-item :label="fieldName('STANDARD_BUSINESS_TYPE', t('standard.fields.businessType'))">
              <a-select
                v-model="editForm.businessTypeCode"
                :options="businessTypeOptions"
                allow-clear
              />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="fieldName('COUNTRY', t('standard.fields.countries'))">
              <a-select v-model="editForm.countryCodes" :options="countryOptions" multiple />
            </a-form-item>
          </a-grid-item>
          <a-grid-item v-if="fieldEnabled('STANDARD_EFFECTIVE_DATE')">
            <a-form-item :label="fieldName('STANDARD_EFFECTIVE_DATE', t('standard.fields.effectiveAt'))">
              <a-date-picker v-model="editForm.effectiveAt" style="width: 100%" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item v-if="fieldEnabled('STANDARD_ENABLED_STATUS')">
            <a-form-item :label="fieldName('STANDARD_ENABLED_STATUS', t('standard.fields.enabledStatus'))">
              <a-switch v-model="editForm.isEnabled" />
            </a-form-item>
          </a-grid-item>
        </a-grid>
      </a-form>
    </a-modal>

    <a-modal
      v-model:visible="versionVisible"
      :title="editingVersionId ? t('standard.editVersionDraft') : t('standard.createVersion')"
      :width="680"
      :ok-loading="saveVersionMutation.isPending.value || uploadMutation.isPending.value"
      @ok="submitVersion"
    >
      <a-form :model="versionForm" layout="vertical">
        <a-grid :cols="2" :col-gap="12">
          <a-grid-item>
            <a-form-item :label="fieldName('STANDARD_CURRENT_VERSION', t('standard.fields.version'))">
              <a-input v-model="versionForm.version" :placeholder="t('standard.autoVersionPlaceholder')" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="fieldName('STANDARD_EFFECTIVE_DATE', t('standard.fields.effectiveAt'))">
              <a-date-picker v-model="versionForm.effectiveAt" style="width: 100%" />
            </a-form-item>
          </a-grid-item>
        </a-grid>
        <a-form-item :label="t('standard.fields.changeDescription')">
          <a-textarea v-model="versionForm.changeDescription" />
        </a-form-item>
        <a-form-item :label="t('standard.newVersionFile')">
          <label class="file-picker">
            <input type="file" @change="selectVersionFile" />
            <span>{{
              versionSelectedFile?.name ||
                (versionForm.fileVersionId ? t('standard.keepCurrentFile') : t('standard.selectFile'))
            }}</span>
          </label>
        </a-form-item>
      </a-form>
    </a-modal>
  </section>
</template>

<style scoped lang="scss">
.standard-library {
  width: 100%;
  min-width: 0;
  min-height: 758px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 13px 13px;
  overflow: hidden;
  color: #1d2129;
  background: #fff;
  font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.metrics {
  width: 100%;
  min-width: 936px;
  height: 88px;
  display: flex;
  flex: 0 0 88px;
  align-items: center;
  gap: 12px;
  background: #fff;
}

.metric {
  min-width: 0;
  height: 76px;
  display: flex;
  flex: 1 1 0;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  overflow: hidden;
}

.metric__icon {
  width: 48px;
  height: 48px;
  display: flex;
  flex: 0 0 48px;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 32px;
    height: 32px;
    display: block;
  }
}

.metric__content {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;

  > span {
    color: #999ea8;
    font-size: 12px;
    font-weight: 400;
    line-height: normal;
  }

  strong {
    display: flex;
    align-items: baseline;
    gap: 4px;
    color: #1d2129;
    font-size: 22px;
    font-weight: 700;
    line-height: normal;
    white-space: nowrap;
  }

  small {
    font-size: 12px;
    font-weight: 400;
  }
}

.toolbar {
  width: 100%;
  min-width: 936px;
  height: 32px;
  display: flex;
  flex: 0 0 32px;
  align-items: center;
  justify-content: space-between;
}

.toolbar__left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.keyword-input {
  width: 270px;

  :deep(.arco-input-wrapper) {
    height: 32px;
    padding: 5px 12px;
    border: 0;
    border-radius: 0;
    background: #f2f3f5;
  }

  :deep(.arco-input) {
    color: #1d2129;
    font-size: 13px;
    line-height: 22px;
  }

  :deep(.arco-input::placeholder) {
    color: #86909c;
  }
}

.design-button {
  height: 32px;
  padding: 5px 16px;
  border-radius: 0;
  font-size: 14px;
  line-height: 22px;

  :deep(.arco-btn-icon) {
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-right: 8px;
  }
}

.button-icon {
  width: 11px;
  height: 11px;
  display: block;
}

.library-panel {
  width: 100%;
  min-width: 936px;
  height: 625px;
  display: flex;
  flex: 0 0 625px;
  align-items: stretch;
  overflow: hidden;
  border: 1px solid #e5e6eb;
  background: #fff;
}

.category-sidebar {
  width: 270px;
  height: 100%;
  display: flex;
  flex: 0 0 270px;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid #e5e6eb;
  background: #fafafc;
}

.category-tabs {
  width: 100%;
  height: 44px;
  display: flex;
  flex: 0 0 44px;
  border-bottom: 1px solid #e5e6eb;

  button {
    height: 44px;
    position: relative;
    display: flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    color: #999;
    background: transparent;
    font: 500 13px/normal inherit;
    cursor: pointer;
  }

  button.active {
    color: #2563eb;
  }

  button.active::after {
    height: 2px;
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    content: '';
    background: #2563eb;
  }
}

.category-list {
  min-height: 0;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;

  button {
    width: 100%;
    height: 44px;
    display: flex;
    align-items: center;
    padding: 0 12px 0 16px;
    border: 0;
    color: #212121;
    background: #fafafc;
    font: 400 13px/normal inherit;
    cursor: pointer;
    text-align: left;
  }

  button.active {
    color: #2563eb;
    background: #e8effc;
    font-weight: 500;
  }

  span {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    flex: 0 0 auto;
    color: #999;
    font-size: 11px;
    font-weight: 400;
    text-align: right;
    white-space: nowrap;
  }
}

.content-scroll {
  min-width: 0;
  height: 100%;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
}

.content-panel {
  width: 100%;
  min-width: 937px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.category-description {
  width: 100%;
  height: 80px;
  display: flex;
  flex: 0 0 80px;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 16px;
  overflow: hidden;

  h1 {
    margin: 0;
    color: #212121;
    font-size: 16px;
    font-weight: 500;
    line-height: normal;
    white-space: nowrap;
  }

  p {
    width: 100%;
    margin: 0;
    overflow: hidden;
    color: #808080;
    font-size: 13px;
    font-weight: 400;
    line-height: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.table-region {
  min-height: 0;
  position: relative;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
}

.standard-table {
  width: 937px;
  border-spacing: 0;
  border-collapse: separate;
  table-layout: fixed;

  .column-title {
    width: 365px;
  }

  .column-version {
    width: 90px;
  }

  .column-date {
    width: 130px;
  }

  .column-updater {
    width: 170px;
  }

  .column-actions {
    width: 182px;
  }

  th,
  td {
    height: 44px;
    padding: 0 12px;
    overflow: hidden;
    border-right: 1px solid #e5e6eb;
    border-bottom: 1px solid #e5e6eb;
    color: #1d2129;
    font-size: 13px;
    line-height: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  th {
    position: sticky;
    z-index: 2;
    top: 0;
    background: #f2f3f5;
    font-weight: 500;
    text-align: center;
  }

  tbody tr:nth-child(odd) td {
    background: #fff;
  }

  tbody tr:nth-child(even) td {
    background: #f7f8fa;
  }

  .title-cell button,
  .action-cell button,
  .version-link {
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }

  .title-cell button {
    max-width: 100%;
    overflow: hidden;
    color: #165dff;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .center-cell {
    text-align: center;
  }

  .action-cell {
    text-align: center;

    button + button {
      margin-left: 24px;
    }
  }

  .action-edit {
    color: #3878f5;
  }

  .action-archive {
    color: #e33836;
  }

  .empty-cell {
    color: #86909c;
    text-align: center;
  }
}

.table-loading {
  position: absolute;
  z-index: 3;
  inset: 44px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(255 255 255 / 64%);
}

.detail-loading {
  min-height: 240px;
  display: block;
}

.detail-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.version-section {
  margin-top: 20px;

  h2 {
    margin: 0 0 10px;
    font-size: 15px;
    font-weight: 500;
  }
}

.version-link {
  max-width: 100%;
  overflow: hidden;
  color: #165dff;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-picker {
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border: 1px dashed #c9cdd4;
  background: #f7f8fa;
  cursor: pointer;

  input {
    max-width: 240px;
  }

  span {
    min-width: 0;
    overflow: hidden;
    color: #4e5969;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
