<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Message from '@arco-design/web-vue/es/message'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import metricCompletedFolders from '@/domains/archive/assets/metric-completed-folders.svg'
import metricCompletion from '@/domains/archive/assets/metric-completion.svg'
import metricFolders from '@/domains/archive/assets/metric-folders.svg'
import metricItems from '@/domains/archive/assets/metric-items.svg'
import metricRequired from '@/domains/archive/assets/metric-required.svg'
import { archiveApi } from '@/domains/archive/api/archive.api'
import {
  useArchiveProjectOptionsQuery,
  useArchiveTreeQuery,
} from '@/domains/archive/queries/useArchiveQueries'
import type {
  ProjectArchiveTargetFolder,
  ProjectArchiveTargetItem,
} from '@/domains/archive/types/archive'
import { resolveProjectArchiveFileName } from '@/domains/archive/utils/project-archive-file'
import { BusinessModal, BusinessTable, PageContainer } from '@/design-system'
import { usePermission } from '@/composables/usePermission'
import { useFieldConfig } from '@/platform/field-configuration'
import { useFilePreview } from '@/platform/file-preview/useFilePreview'
import { fileApi } from '@/platform/file/file.api'
import { Can } from '@/platform/permission'
import { queryKeys } from '@/query/keys'
import { arcoConfirm } from '@/utils/arco-dialog'
import { downloadBlob } from '@/utils/blob'

interface ArcoUploadFileItem {
  file?: File
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const filePreview = useFilePreview()
const { hasPermission } = usePermission()
const queryClient = useQueryClient()
const fieldConfig = useFieldConfig('project-archive')

const selectedProjectId = ref(normalizeProjectId(route.query.projectId))
const projectKeyword = ref('')
const selectedFolderId = ref('')
const uploadVisible = ref(false)
const uploadItem = ref<ProjectArchiveTargetItem | null>(null)
const uploadFile = ref<File | null>(null)
const uploadProgress = ref(0)
const uploadForm = reactive({ changeDescription: '' })

const archiveProjectsQuery = useArchiveProjectOptionsQuery(projectKeyword)
const archiveTreeQuery = useArchiveTreeQuery(selectedProjectId)
const projects = computed(() => archiveProjectsQuery.data.value?.items ?? [])
const tree = computed(() => archiveTreeQuery.data.value ?? null)
const loadingProjects = computed(() => archiveProjectsQuery.isFetching.value)
const loadingTree = computed(() => archiveTreeQuery.isFetching.value)

const activeFolders = computed(() =>
  (tree.value?.folders ?? []).filter((folder) => !folder.archivedAt),
)
const selectedFolder = computed<ProjectArchiveTargetFolder | null>(
  () => activeFolders.value.find((folder) => folder.id === selectedFolderId.value) ?? null,
)
const selectedFolderItems = computed(() =>
  (selectedFolder.value?.items ?? []).filter((item) => !item.archivedAt),
)

const totalItems = computed(() =>
  activeFolders.value.reduce((total, folder) => total + folder.totalCount, 0),
)
const completedItems = computed(() =>
  activeFolders.value.reduce((total, folder) => total + folder.completedCount, 0),
)
const requiredTotal = computed(() =>
  activeFolders.value.reduce((total, folder) => total + folder.requiredTotalCount, 0),
)
const requiredCompleted = computed(() =>
  activeFolders.value.reduce((total, folder) => total + folder.requiredCompletedCount, 0),
)
const completedFolders = computed(
  () =>
    activeFolders.value.filter(
      (folder) => folder.totalCount > 0 && folder.completedCount === folder.totalCount,
    ).length,
)
const completionRate = computed(() =>
  totalItems.value > 0 ? Math.round((completedItems.value / totalItems.value) * 100) : 0,
)
const metrics = computed(() => [
  {
    key: 'completion',
    icon: metricCompletion,
    label: t('archive.summary.completion'),
    value: `${completionRate.value}%`,
    suffix: '',
    caption: '',
  },
  {
    key: 'items',
    icon: metricItems,
    label: t('archive.summary.items'),
    value: String(completedItems.value),
    suffix: `/ ${totalItems.value}`,
    caption: t('archive.summary.completedAll'),
  },
  {
    key: 'required',
    icon: metricRequired,
    label: t('archive.summary.required'),
    value: String(requiredCompleted.value),
    suffix: `/ ${requiredTotal.value}`,
    caption: t('archive.summary.completedRequired'),
  },
  {
    key: 'folders',
    icon: metricFolders,
    label: t('archive.summary.scale'),
    value: String(activeFolders.value.length),
    suffix: '',
    caption: '',
  },
  {
    key: 'completed-folders',
    icon: metricCompletedFolders,
    label: t('archive.completedFolders'),
    value: String(completedFolders.value),
    suffix: '',
    caption: '',
  },
])

const uploadAccept = computed(() => {
  const enabledTypes = new Set(
    fieldConfig.getFieldOptions('FILE_TYPE').map((option) => option.value.toLowerCase()),
  )
  const itemTypes = (uploadItem.value?.allowedExtensions ?? [])
    .filter((extension): extension is string => typeof extension === 'string')
    .map((extension) => extension.replace(/^\./u, '').toLowerCase())
  return itemTypes
    .filter((extension) => enabledTypes.has(extension))
    .map((extension) => `.${extension}`)
    .join(',')
})

const uploadMutation = useMutation({
  mutationFn: ({
    projectId,
    itemId,
    file,
    logicalFileId,
  }: {
    projectId: string
    itemId: string
    file: File
    logicalFileId?: string
  }) =>
    archiveApi.uploadFile(
      projectId,
      itemId,
      file,
      {
        uploadMode: logicalFileId ? 'NEW_VERSION' : 'REPLACE',
        revisionLevel: 'MINOR',
        logicalFileId,
        changeDescription: uploadForm.changeDescription.trim() || undefined,
      },
      (percentage) => {
        uploadProgress.value = percentage
      },
    ),
  retry: false,
  onSuccess: async (_, variables) => invalidateArchiveTree(variables.projectId),
})

const deleteFileMutation = useMutation({
  mutationFn: (logicalFileId: string) => fileApi.archive(logicalFileId),
  retry: false,
  onSuccess: async () => invalidateArchiveTree(),
})

const uploading = computed(() => uploadMutation.isPending.value)

function normalizeProjectId(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

async function changeProject(value: unknown): Promise<void> {
  const projectId = typeof value === 'string' ? value : ''
  selectedProjectId.value = projectId
  projectKeyword.value = ''
  await router.replace({
    path: route.path,
    query: projectId ? { projectId } : {},
  })
}

async function invalidateArchiveTree(projectId = selectedProjectId.value): Promise<void> {
  if (!projectId) return
  await queryClient.invalidateQueries({ queryKey: queryKeys.archive.tree(projectId) })
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

function formatFileSize(value?: string | null): string {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  const format = (size: number, unit: string) =>
    `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(size)} ${unit}`
  if (bytes < 1024) return format(bytes, 'B')
  if (bytes < 1024 ** 2) return format(bytes / 1024, 'KB')
  if (bytes < 1024 ** 3) return format(bytes / 1024 ** 2, 'MB')
  return format(bytes / 1024 ** 3, 'GB')
}

function previewItem(item: ProjectArchiveTargetItem): void {
  if (!item.currentVersion || item.currentVersion.canPreview === false) return
  const previewIdentifier =
    item.currentVersion.previewIdentifier || item.currentVersion.logicalFileId
  if (!previewIdentifier) return
  filePreview.openPreview({
    id: previewIdentifier,
    title: resolveProjectArchiveFileName(item),
  })
}

function openUpload(item: ProjectArchiveTargetItem): void {
  uploadItem.value = item
  uploadFile.value = null
  uploadProgress.value = 0
  uploadForm.changeDescription = ''
  uploadVisible.value = true
}

function openFolderUpload(): void {
  const target =
    selectedFolderItems.value.find((item) => item.canUpload && !item.currentVersion) ??
    selectedFolderItems.value.find((item) => item.canUpload)
  if (!target) {
    Message.info(t('archive.messages.noUploadTarget'))
    return
  }
  openUpload(target)
}

async function downloadItem(item: ProjectArchiveTargetItem): Promise<void> {
  const logicalFileId = item.currentVersion?.logicalFileId
  if (!logicalFileId || !canDownloadItem(item)) return
  try {
    const blob = await fileApi.download(logicalFileId)
    downloadBlob(blob, resolveProjectArchiveFileName(item))
  } catch {
    Message.error(t('archive.messages.downloadFailed'))
  }
}

function canDownloadItem(item: ProjectArchiveTargetItem): boolean {
  return item.canDownload ?? hasPermission('file:download')
}

async function deleteFile(item: ProjectArchiveTargetItem): Promise<void> {
  const logicalFileId = item.currentVersion?.logicalFileId
  if (!logicalFileId) return
  const fileName = resolveProjectArchiveFileName(item)
  try {
    await arcoConfirm(
      t('archive.deleteFile.confirm', {
        name: fileName,
      }),
      t('archive.deleteFile.title'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
      },
    )
  } catch {
    return
  }
  try {
    await deleteFileMutation.mutateAsync(logicalFileId)
    Message.success(t('archive.messages.fileDeleted'))
  } catch {
    Message.error(t('archive.messages.deleteFailed'))
  }
}

function handleUploadSelection(
  _fileList: ArcoUploadFileItem[],
  fileItem?: ArcoUploadFileItem,
): void {
  uploadFile.value = fileItem?.file ?? null
}

async function submitUpload(): Promise<void> {
  if (!uploadItem.value || !selectedProjectId.value || !uploadFile.value) {
    Message.warning(t('archive.validation.uploadFileRequired'))
    return
  }
  const extension = uploadFile.value.name.split('.').pop()?.toLowerCase() ?? ''
  const enabledTypes = new Set(
    fieldConfig.getFieldOptions('FILE_TYPE').map((option) => option.value.toLowerCase()),
  )
  if (!enabledTypes.has(extension)) {
    Message.warning(t('archive.validation.fileTypeDisabled'))
    return
  }
  await uploadMutation.mutateAsync({
    projectId: selectedProjectId.value,
    itemId: uploadItem.value.id,
    file: uploadFile.value,
    logicalFileId: uploadItem.value.currentVersion?.logicalFileId,
  })
  Message.success(
    uploadItem.value.reviewRequired
      ? t('archive.messages.uploadedForReview')
      : t('archive.messages.uploaded'),
  )
  uploadVisible.value = false
}

watch(
  () => route.query.projectId,
  (value) => {
    const projectId = normalizeProjectId(value)
    if (projectId !== selectedProjectId.value) selectedProjectId.value = projectId
  },
)

watch(
  projects,
  (projectList) => {
    if (!selectedProjectId.value && projectList.length) {
      selectedProjectId.value = projectList[0].id
      void router.replace({
        path: route.path,
        query: { projectId: projectList[0].id },
      })
    }
  },
  { immediate: true },
)

watch(
  activeFolders,
  (folders) => {
    if (!folders.some((folder) => folder.id === selectedFolderId.value)) {
      selectedFolderId.value = folders[0]?.id ?? ''
    }
  },
  { immediate: true },
)
</script>

<template>
  <PageContainer class="archive-page" gap="normal" :scrollable="false">
    <section class="archive-metrics" :aria-label="t('archive.metricsAria')">
      <article v-for="metric in metrics" :key="metric.key" class="archive-metric">
        <span class="archive-metric__icon" aria-hidden="true">
          <img :src="metric.icon" alt="" />
        </span>
        <span class="archive-metric__body">
          <span class="archive-metric__label">{{ metric.label }}</span>
          <span class="archive-metric__value-line">
            <strong>{{ metric.value }}</strong>
            <span v-if="metric.suffix">{{ metric.suffix }}</span>
          </span>
          <small v-if="metric.caption">{{ metric.caption }}</small>
        </span>
      </article>
    </section>

    <section class="archive-toolbar">
      <a-select
        :model-value="selectedProjectId"
        :loading="loadingProjects"
        :filter-option="false"
        allow-search
        class="archive-project-select"
        :placeholder="t('archive.selectProject')"
        @search="projectKeyword = $event"
        @change="changeProject"
      >
        <a-option
          v-for="project in projects"
          :key="project.id"
          :value="project.id"
          :label="project.projectName"
        />
      </a-select>
      <div class="archive-toolbar__right">
        <span v-if="tree" class="archive-project-meta">
          {{ tree.project.code }}
          {{
            tree.template.version
              ? t('archive.templateVersion', { version: tree.template.version })
              : t('archive.noTemplateVersion')
          }}
        </span>
        <Can permission="archive:upload">
          <a-button
            type="primary"
            class="archive-upload-button"
            :disabled="!selectedFolder"
            @click="openFolderUpload"
          >
            <span class="archive-upload-icon" aria-hidden="true">
              <i class="archive-upload-icon__tray" />
              <i class="archive-upload-icon__left" />
              <i class="archive-upload-icon__right" />
              <i class="archive-upload-icon__shaft" />
              <i class="archive-upload-icon__arrow-left" />
              <i class="archive-upload-icon__arrow-right" />
            </span>
            {{ t('common.upload') }}
          </a-button>
        </Can>
      </div>
    </section>

    <a-spin :loading="loadingTree" class="archive-loading">
      <section v-if="tree && activeFolders.length" class="archive-workspace">
        <aside class="archive-directory" :aria-label="t('archive.projectDirectory')">
          <header>{{ t('archive.projectDirectory') }}</header>
          <nav class="archive-directory__scroll">
            <button
              v-for="folder in activeFolders"
              :key="folder.id"
              type="button"
              :class="['archive-directory__item', { active: folder.id === selectedFolderId }]"
              :title="folder.name"
              @click="selectedFolderId = folder.id"
            >
              <span class="archive-folder-icon" aria-hidden="true">
                <i class="archive-folder-icon__back" />
                <i class="archive-folder-icon__tab" />
                <i class="archive-folder-icon__front" />
              </span>
              <span class="archive-directory__name">{{ folder.name }}</span>
              <small>{{ folder.totalCount }}</small>
            </button>
          </nav>
        </aside>

        <section v-if="selectedFolder" class="archive-files">
          <header class="archive-folder-heading">
            <h2>{{ selectedFolder.name }}</h2>
            <p v-if="selectedFolder.description">
              {{ selectedFolder.description }}
            </p>
          </header>
          <BusinessTable
            class="archive-file-table"
            :data="selectedFolderItems"
            row-key="id"
            size="small"
            bordered
            stripe
            preserve-column-widths
            :batch-size="Math.max(20, selectedFolderItems.length)"
            :scroll="{ x: 937 }"
            :empty-title="t('archive.emptyFolder')"
          >
            <template #columns>
              <a-table-column :title="t('archive.columns.fileName')" :width="340" align="left">
                <template #cell="{ record }">
                  <button
                    class="archive-file-name"
                    :class="{
                      disabled:
                        !record.currentVersion || record.currentVersion.canPreview === false,
                    }"
                    type="button"
                    :disabled="!record.currentVersion || record.currentVersion.canPreview === false"
                    :title="resolveProjectArchiveFileName(record)"
                    @click="previewItem(record)"
                  >
                    {{ resolveProjectArchiveFileName(record) }}
                  </button>
                </template>
              </a-table-column>
              <a-table-column :title="t('archive.columns.version')" :width="80" align="center">
                <template #cell="{ record }">
                  {{ record.currentVersion?.version || '—' }}
                </template>
              </a-table-column>
              <a-table-column :title="t('archive.columns.fileSize')" :width="100" align="center">
                <template #cell="{ record }">
                  {{ formatFileSize(record.currentVersion?.fileSize) }}
                </template>
              </a-table-column>
              <a-table-column :title="t('archive.columns.uploader')" :width="113" align="center">
                <template #cell="{ record }">
                  {{ record.currentVersion?.uploader?.realName || '—' }}
                </template>
              </a-table-column>
              <a-table-column :title="t('archive.columns.uploadedAt')" :width="122" align="center">
                <template #cell="{ record }">
                  {{ formatDate(record.currentVersion?.uploadedAt) }}
                </template>
              </a-table-column>
              <a-table-column :title="t('common.action')" :width="182" align="center">
                <template #cell="{ record }">
                  <span class="archive-row-actions">
                    <button v-if="record.canUpload" type="button" @click="openUpload(record)">
                      {{ t('archive.updateFile') }}
                    </button>
                    <button
                      v-if="canDownloadItem(record) && record.currentVersion"
                      type="button"
                      @click="downloadItem(record)"
                    >
                      {{ t('common.download') }}
                    </button>
                    <button
                      v-if="record.canDeleteFile && record.currentVersion"
                      type="button"
                      class="danger"
                      @click="deleteFile(record)"
                    >
                      {{ t('common.delete') }}
                    </button>
                  </span>
                </template>
              </a-table-column>
            </template>
          </BusinessTable>
        </section>
      </section>
      <a-empty
        v-else-if="!loadingTree"
        :description="tree ? t('archive.emptySnapshot') : t('archive.selectAccessibleProject')"
      />
    </a-spin>

    <BusinessModal
      v-model:visible="uploadVisible"
      :title="t('archive.uploadTitle')"
      :width="560"
      :footer="false"
      :mask-closable="!uploading"
      :closable="!uploading"
    >
      <a-form :model="uploadForm" layout="vertical">
        <a-form-item :label="t('archive.archiveItemLabel')">
          <a-input :model-value="uploadItem?.name" disabled />
        </a-form-item>
        <a-form-item :label="t('archive.file')" required>
          <a-upload
            :auto-upload="false"
            :limit="1"
            :accept="uploadAccept || undefined"
            :disabled="uploading || fieldConfig.loading.value"
            @change="handleUploadSelection"
          />
        </a-form-item>
        <a-form-item :label="t('archive.changeDescription')">
          <a-textarea
            v-model="uploadForm.changeDescription"
            :max-length="1000"
            show-word-limit
            :placeholder="t('archive.changePlaceholder')"
          />
        </a-form-item>
        <a-progress v-if="uploading" :percent="uploadProgress / 100" />
        <div class="archive-modal-actions">
          <a-button :disabled="uploading" @click="uploadVisible = false">
            {{ t('common.cancel') }}
          </a-button>
          <a-button type="primary" :loading="uploading" @click="submitUpload">
            {{ t('common.upload') }}
          </a-button>
        </div>
      </a-form>
    </BusinessModal>
  </PageContainer>
</template>

<style scoped lang="scss">
.archive-page {
  --archive-border: #e5e6eb;
  width: 100%;
  height: 100%;
  min-width: 1234px;
  min-height: 0;
  box-sizing: border-box;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 13px;
  color: #1d2129;
  font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.archive-metrics {
  width: 100%;
  height: 100px;
  display: grid;
  flex: 0 0 100px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  background: #fff;
}

.archive-metric {
  min-width: 0;
  height: 100px;
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
  padding: 14px 16px;
}

.archive-metric__icon {
  width: 48px;
  height: 48px;
  display: flex;
  flex: 0 0 48px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.archive-metric__icon img {
  width: 28px;
  height: 28px;
  display: block;
}

.archive-metric__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.archive-metric__label {
  color: #999ea8;
  font-size: 12px;
  font-weight: 400;
  line-height: normal;
}

.archive-metric__value-line {
  display: flex;
  align-items: baseline;
  gap: 4px;
  color: #1d2129;
  white-space: nowrap;
}

.archive-metric__value-line strong {
  font-size: 22px;
  font-weight: 700;
  line-height: normal;
}

.archive-metric__value-line span {
  font-size: 12px;
  font-weight: 400;
}

.archive-metric__body small {
  color: #bec4cc;
  font-size: 11px;
  font-weight: 400;
  line-height: normal;
  white-space: nowrap;
}

.archive-toolbar {
  width: 100%;
  height: 32px;
  display: flex;
  flex: 0 0 32px;
  align-items: center;
  justify-content: space-between;
}

.archive-project-select {
  width: 270px;
}

.archive-project-select :deep(.arco-select-view-single) {
  height: 32px;
  min-height: 32px;
  border: 0;
  border-radius: 0;
  background: #f2f3f5;
  box-shadow: none;
  padding: 4px 12px;
}

.archive-project-select :deep(.arco-select-view-value) {
  color: #86909c;
  font-size: 13px;
  font-weight: 500;
  line-height: 22px;
}

.archive-project-select :deep(.arco-select-view-arrow) {
  color: #86909c;
  font-size: 12px;
}

.archive-toolbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.archive-project-meta {
  color: #86909c;
  font-size: 12px;
  font-weight: 400;
  line-height: normal;
  white-space: nowrap;
}

.archive-upload-button {
  width: 82px;
  height: 32px;
  min-width: 82px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 0;
  padding: 5px 16px;
  background: #2563eb;
  font-size: 14px;
  font-weight: 400;
}

.archive-upload-icon {
  width: 14px;
  height: 14px;
  position: relative;
  display: block;
  flex: 0 0 14px;
}

.archive-upload-icon i {
  position: absolute;
  display: block;
  border-radius: 0.5px;
  background: #fff;
}

.archive-upload-icon__tray {
  width: 12px;
  height: 1.5px;
  left: 1px;
  top: 12.5px;
}

.archive-upload-icon__left,
.archive-upload-icon__right {
  width: 1.5px;
  height: 4px;
  top: 9px;
}

.archive-upload-icon__left {
  left: 1px;
}

.archive-upload-icon__right {
  left: 11.5px;
}

.archive-upload-icon__shaft {
  width: 1.5px;
  height: 8px;
  left: 6.25px;
  top: 1.5px;
}

.archive-upload-icon__arrow-left,
.archive-upload-icon__arrow-right {
  width: 5px;
  height: 1.5px;
  top: 1.6px;
}

.archive-upload-icon__arrow-left {
  left: 2.8px;
  transform: rotate(-45deg);
}

.archive-upload-icon__arrow-right {
  left: 6.1px;
  transform: rotate(45deg);
}

.archive-loading {
  width: 100%;
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  overflow: hidden;
}

.archive-loading :deep(.arco-spin-children) {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
}

.archive-workspace {
  width: 100%;
  height: 100%;
  min-width: 1208px;
  min-height: 0;
  display: grid;
  flex: 1;
  grid-template-columns: 270px minmax(937px, 1fr);
  overflow: hidden;
  border: 1px solid var(--archive-border);
  background: #fff;
}

.archive-directory {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--archive-border);
  background: #fff;
}

.archive-directory > header {
  height: 44px;
  display: flex;
  flex: 0 0 44px;
  align-items: center;
  overflow: hidden;
  padding-left: 12px;
  border-bottom: 1px solid var(--archive-border);
  background: #f2f3f5;
  color: #1d2129;
  font-size: 13px;
  font-weight: 500;
}

.archive-directory__scroll {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-color: #bec1c8 rgba(240, 240, 242, 0.5);
  scrollbar-width: thin;
}

.archive-directory__scroll::-webkit-scrollbar {
  width: 4px;
}

.archive-directory__scroll::-webkit-scrollbar-track {
  border-radius: 2px;
  background: rgba(240, 240, 242, 0.5);
}

.archive-directory__scroll::-webkit-scrollbar-thumb {
  border-radius: 2px;
  background: #bec1c8;
}

.archive-directory__item {
  width: 100%;
  height: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  padding: 0 8px 0 12px;
  border: 0;
  border-bottom: 0.5px solid var(--archive-border);
  background: #fff;
  color: #1d2129;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.archive-directory__item.active {
  background: #e8effc;
  color: #2563eb;
  font-weight: 500;
}

.archive-directory__name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-directory__item small {
  flex: 0 0 auto;
  color: #999;
  font-size: 11px;
  font-weight: 400;
  line-height: normal;
}

.archive-folder-icon {
  width: 16px;
  height: 14px;
  position: relative;
  display: block;
  flex: 0 0 16px;
  overflow: hidden;
  border-radius: 1px;
}

.archive-folder-icon i {
  position: absolute;
  left: 0;
  display: block;
}

.archive-folder-icon__back {
  width: 16px;
  height: 11px;
  top: 3px;
  border-radius: 1.5px;
  background: #2563eb;
}

.archive-folder-icon__tab {
  width: 7px;
  height: 4px;
  top: 0;
  border-radius: 1.5px 1.5px 0 0;
  background: #2563eb;
}

.archive-folder-icon__front {
  display: none !important;
}

.archive-directory__item.active .archive-folder-icon__back,
.archive-directory__item.active .archive-folder-icon__tab {
  background: #1c52d1;
}

.archive-directory__item.active .archive-folder-icon__front {
  width: 16px;
  height: 9px;
  top: 5px;
  display: block !important;
  border-radius: 0 2px 2px;
  background: #4785f2;
}

.archive-files {
  min-width: 937px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
}

.archive-folder-heading {
  height: 79px;
  display: flex;
  flex: 0 0 79px;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  overflow: hidden;
  padding: 16px;
  background: #fff;
}

.archive-folder-heading h2 {
  margin: 0;
  color: #212121;
  font-size: 16px;
  font-weight: 500;
  line-height: normal;
  white-space: nowrap;
}

.archive-folder-heading p {
  width: 100%;
  height: 20px;
  margin: 0;
  overflow: hidden;
  color: #808080;
  font-size: 12px;
  font-weight: 400;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-files :deep(.business-table) {
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  border-top: 1px solid var(--archive-border);
}

.archive-files :deep(.archive-file-table) {
  height: 100%;
}

.archive-files :deep(.business-table__viewport) {
  height: 100%;
  max-height: none;
  overflow: auto;
  scrollbar-color: #c7c7c7 transparent;
  scrollbar-width: thin;
}

.archive-files :deep(.business-table__viewport::-webkit-scrollbar) {
  width: 4px;
  height: 4px;
}

.archive-files :deep(.business-table__viewport::-webkit-scrollbar-thumb) {
  border-radius: 2px;
  background: #c7c7c7;
}

.archive-files :deep(.archive-file-table .arco-table-th) {
  height: 44px;
  padding: 0 12px;
  border-color: var(--archive-border) !important;
  border-right: 1px solid var(--archive-border) !important;
  background: #f2f3f5;
  color: #333;
  font-size: 13px;
  font-weight: 500;
}

.archive-files :deep(.archive-file-table .arco-table-td) {
  height: 44px;
  padding: 0 12px;
  border-color: var(--archive-border) !important;
  border-right: 1px solid var(--archive-border) !important;
  color: #333;
  font-size: 13px;
  font-weight: 400;
}

.archive-files :deep(.archive-file-table .arco-table-th:last-child),
.archive-files :deep(.archive-file-table .arco-table-td:last-child) {
  border-right: 0 !important;
}

.archive-files :deep(.archive-file-table .arco-table-tr:nth-child(even) .arco-table-td) {
  background: #f7f8fa;
}

.archive-files :deep(.archive-file-table .arco-table-cell) {
  width: 100%;
  overflow: hidden;
  padding: 0;
  text-overflow: ellipsis;
}

.archive-file-name {
  width: 100%;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: transparent;
  color: #165dff;
  cursor: pointer;
  font: inherit;
  font-weight: 500;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-file-name.disabled {
  color: #333;
  cursor: default;
}

.archive-file-name:not(:disabled):hover,
.archive-file-name:not(:disabled):focus-visible {
  color: #0e42d2;
  text-decoration: underline;
}

.archive-file-name:not(:disabled):active {
  color: #072ca6;
}

.archive-row-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  white-space: nowrap;
}

.archive-row-actions button {
  padding: 0;
  border: 0;
  background: transparent;
  color: #3878f5;
  cursor: pointer;
  font: inherit;
}

.archive-row-actions button:hover,
.archive-row-actions button:focus-visible {
  color: #0e42d2;
  text-decoration: underline;
}

.archive-row-actions button:active {
  color: #072ca6;
}

.archive-row-actions button.danger {
  color: #e33836;
}

.archive-row-actions button.danger:hover,
.archive-row-actions button.danger:focus-visible {
  color: #b71c1c;
}

.archive-modal-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 22px;
}
</style>
