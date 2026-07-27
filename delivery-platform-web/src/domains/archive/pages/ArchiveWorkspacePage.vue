<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Message from '@arco-design/web-vue/es/message'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { archiveApi } from '@/domains/archive/api/archive.api'
import {
  BusinessModal,
  BusinessTable,
  PageContainer,
  StatCard,
} from '@/design-system'
import { Can } from '@/platform/permission'
import {
  useArchiveProjectOptionsQuery,
  useArchiveTemplateDiffQuery,
  useArchiveTreeQuery,
} from '@/domains/archive/queries/useArchiveQueries'
import { fileApi } from '@/platform/file/file.api'
import { useFilePreview } from '@/platform/file-preview/useFilePreview'
import { queryKeys } from '@/query/keys'
import type {
  ProjectArchiveTargetFolder,
  ProjectArchiveTargetItem,
} from '@/domains/archive/types/archive'
import { arcoConfirm } from '@/utils/arco-dialog'
import { downloadBlob } from '@/utils/blob'

interface ArcoUploadFileItem {
  file?: File
}

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const filePreview = useFilePreview()
const queryClient = useQueryClient()

const selectedProjectId = ref(normalizeProjectId(route.query.projectId))
const projectKeyword = ref('')
const selectedFolderId = ref('')

const uploadVisible = ref(false)
const uploadItem = ref<ProjectArchiveTargetItem | null>(null)
const uploadFile = ref<File | null>(null)
const uploadProgress = ref(0)
const uploadForm = reactive({
  uploadMode: 'NEW_VERSION' as 'REPLACE' | 'NEW_VERSION',
  revisionLevel: 'MINOR' as 'MINOR' | 'MAJOR',
  createAsNewFile: false,
  changeDescription: '',
})

const syncVisible = ref(false)

const archiveProjectsQuery = useArchiveProjectOptionsQuery()
const archiveTreeQuery = useArchiveTreeQuery(selectedProjectId)
const archiveTemplateDiffQuery = useArchiveTemplateDiffQuery(selectedProjectId, syncVisible)
const projects = computed(() => archiveProjectsQuery.data.value?.items ?? [])
const tree = computed(() => archiveTreeQuery.data.value ?? null)
const templateDiff = computed(() => archiveTemplateDiffQuery.data.value ?? null)
const loadingProjects = computed(() => archiveProjectsQuery.isFetching.value)
const loadingTree = computed(() => archiveTreeQuery.isFetching.value)
const syncLoading = computed(() => archiveTemplateDiffQuery.isFetching.value)

const filteredProjects = computed(() => {
  const keyword = projectKeyword.value.trim().toLowerCase()
  if (!keyword) return projects.value
  return projects.value.filter((project) =>
    `${project.projectCode} ${project.projectName}`.toLowerCase().includes(keyword),
  )
})

const activeFolders = computed(() =>
  (tree.value?.folders ?? []).filter((folder) => !folder.archivedAt),
)
const selectedFolder = computed<ProjectArchiveTargetFolder | null>(
  () => activeFolders.value.find((folder) => folder.id === selectedFolderId.value) ?? null,
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
  () => activeFolders.value.filter(
    (folder) => folder.totalCount > 0 && folder.completedCount === folder.totalCount,
  ).length,
)

const completionRate = computed(() =>
  totalItems.value > 0 ? Math.round((completedItems.value / totalItems.value) * 100) : 0,
)

function normalizeProjectId(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

async function changeProject(value: unknown): Promise<void> {
  const projectId = typeof value === 'string' ? value : ''
  selectedProjectId.value = projectId
  await router.replace({
    path: route.path,
    query: projectId ? { projectId } : {},
  })
}

async function invalidateArchiveTree(projectId = selectedProjectId.value): Promise<void> {
  if (!projectId) return
  await queryClient.invalidateQueries({ queryKey: queryKeys.archive.tree(projectId) })
}

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
        uploadMode: uploadForm.uploadMode,
        revisionLevel: uploadForm.revisionLevel,
        logicalFileId: uploadForm.createAsNewFile ? undefined : logicalFileId,
        createNewLogicalFile: uploadForm.createAsNewFile,
        changeDescription: uploadForm.changeDescription.trim() || undefined,
      },
      (percentage) => {
        uploadProgress.value = percentage
      },
    ),
  retry: false,
  onSuccess: async (_, variables) => invalidateArchiveTree(variables.projectId),
})

const templateSyncMutation = useMutation({
  mutationFn: ({
    projectId,
    folderStableKeys,
    itemStableKeys,
  }: {
    projectId: string
    folderStableKeys: string[]
    itemStableKeys: string[]
  }) =>
    archiveApi.syncTemplateAdditions(projectId, {
      confirmAdditions: true,
      folderStableKeys,
      itemStableKeys,
    }),
  retry: false,
  onSuccess: async (_, variables) =>
    Promise.all([
      invalidateArchiveTree(variables.projectId),
      queryClient.invalidateQueries({
        queryKey: queryKeys.archive.templateDiff(variables.projectId),
      }),
    ]),
})

const archiveItemMutation = useMutation({
  mutationFn: ({
    projectId,
    itemId,
    action,
  }: {
    projectId: string
    itemId: string
    action: 'archive' | 'restore'
  }) =>
    action === 'archive'
      ? archiveApi.archiveItem(projectId, itemId)
      : archiveApi.restoreItem(projectId, itemId),
  retry: false,
  onSuccess: async (_, variables) => invalidateArchiveTree(variables.projectId),
})

const uploading = computed(() => uploadMutation.isPending.value)
const syncSaving = computed(() => templateSyncMutation.isPending.value)

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

function formatFileSize(value?: string | null): string {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function previewItem(item: ProjectArchiveTargetItem): void {
  if (item.currentVersion?.canPreview === false) {
    Message.warning(t('archive.messages.previewRestricted'))
    return
  }
  const previewIdentifier =
    item.currentVersion?.previewIdentifier || item.currentVersion?.logicalFileId
  if (!previewIdentifier) {
    Message.info(t('archive.messages.noPreviewFile'))
    return
  }
  filePreview.openPreview({
    id: previewIdentifier,
    title: item.currentVersion?.displayName || item.name,
  })
}

function openUpload(item: ProjectArchiveTargetItem): void {
  uploadItem.value = item
  uploadFile.value = null
  uploadProgress.value = 0
  uploadForm.uploadMode = item.currentVersion ? 'NEW_VERSION' : 'REPLACE'
  uploadForm.revisionLevel = 'MINOR'
  uploadForm.createAsNewFile = false
  uploadForm.changeDescription = ''
  uploadVisible.value = true
}

function openFolderUpload(): void {
  const target = selectedFolder.value?.items.find(
    (item) => item.canUpload && !item.currentVersion,
  ) ?? selectedFolder.value?.items.find((item) => item.canUpload)
  if (!target) {
    Message.info('当前文件夹没有可上传的档案项')
    return
  }
  openUpload(target)
}

async function downloadItem(item: ProjectArchiveTargetItem): Promise<void> {
  const logicalFileId = item.currentVersion?.logicalFileId
  if (!logicalFileId) {
    Message.info(t('archive.messages.noPreviewFile'))
    return
  }
  const blob = await fileApi.download(logicalFileId)
  downloadBlob(blob, item.currentVersion?.displayName || item.name)
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
  const currentLogicalFileId = uploadItem.value.currentVersion?.logicalFileId
  await uploadMutation.mutateAsync({
    projectId: selectedProjectId.value,
    itemId: uploadItem.value.id,
    file: uploadFile.value,
    logicalFileId: currentLogicalFileId,
  })
  Message.success(
    uploadItem.value.reviewRequired
      ? t('archive.messages.uploadedForReview')
      : t('archive.messages.uploaded'),
  )
  uploadVisible.value = false
}

async function openTemplateSync(): Promise<void> {
  if (!selectedProjectId.value) return
  syncVisible.value = true
  await archiveTemplateDiffQuery.refetch()
}

async function confirmTemplateSync(): Promise<void> {
  if (!selectedProjectId.value || !templateDiff.value?.canSync) return
  await templateSyncMutation.mutateAsync({
    projectId: selectedProjectId.value,
    folderStableKeys: templateDiff.value.additions.folders.map((item) => item.stableKey),
    itemStableKeys: templateDiff.value.additions.items.map((item) => item.stableKey),
  })
  Message.success(t('archive.messages.templateSynced'))
  syncVisible.value = false
}

async function archiveItem(item: ProjectArchiveTargetItem): Promise<void> {
  if (!selectedProjectId.value) return
  try {
    await arcoConfirm(
      t('archive.archiveItem.confirm', { name: item.name }),
      t('archive.archiveItem.title'),
      {
        type: 'warning',
        confirmButtonText: t('archive.archiveItem.action'),
      },
    )
  } catch {
    return
  }
  await archiveItemMutation.mutateAsync({
    projectId: selectedProjectId.value,
    itemId: item.id,
    action: 'archive',
  })
  Message.success(t('archive.messages.archived'))
}

async function restoreItem(item: ProjectArchiveTargetItem): Promise<void> {
  if (!selectedProjectId.value) return
  await archiveItemMutation.mutateAsync({
    projectId: selectedProjectId.value,
    itemId: item.id,
    action: 'restore',
  })
  Message.success(t('archive.messages.restored'))
}

watch(
  () => route.query.projectId,
  (value) => {
    const projectId = normalizeProjectId(value)
    if (projectId && projectId !== selectedProjectId.value) {
      selectedProjectId.value = projectId
    }
  },
)

watch(
  projects,
  (projectList) => {
    if (!projectList.length) {
      selectedProjectId.value = ''
      return
    }
    if (!projectList.some((project) => project.id === selectedProjectId.value)) {
      selectedProjectId.value = projectList[0].id
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
  <PageContainer class="archive-page" gap="compact" :scrollable="false">
    <section class="summary-grid">
      <StatCard :label="t('archive.summary.completion')" :value="`${completionRate}%`" tone="blue">
        <a-progress :percent="completionRate / 100" :show-text="false" />
      </StatCard>
      <StatCard
        :label="t('archive.summary.items')"
        :value="`${completedItems} / ${totalItems}`"
        tone="green"
      >
        <small>{{ t('archive.summary.completedAll') }}</small>
      </StatCard>
      <StatCard
        :label="t('archive.summary.required')"
        :value="`${requiredCompleted} / ${requiredTotal}`"
        tone="cyan"
      >
        <small>{{ t('archive.summary.completedRequired') }}</small>
      </StatCard>
      <StatCard :label="t('archive.summary.scale')" :value="activeFolders.length" tone="red">
        <small>{{ t('archive.summary.twoLevelFolders') }}</small>
      </StatCard>
      <StatCard :label="t('archive.completedFolders')" :value="completedFolders" tone="blue">
        <small>{{ completedFolders }} / {{ activeFolders.length }}</small>
      </StatCard>
    </section>

    <section class="archive-workspace-panel">
      <div class="archive-toolbar">
        <a-select
          :model-value="selectedProjectId"
          :loading="loadingProjects"
          allow-search
          :placeholder="t('archive.projectSearchPlaceholder')"
          @search="projectKeyword = $event"
          @change="changeProject"
        >
          <a-option
            v-for="project in filteredProjects"
            :key="project.id"
            :value="project.id"
            :label="`${project.projectName}（${project.projectCode}）`"
          />
        </a-select>
        <div v-if="tree" class="project-meta">
          <span>{{ tree.project.code }}</span>
          <span>
            {{
              tree.template.version
                ? t('archive.templateVersion', { version: tree.template.version })
                : t('archive.noTemplateVersion')
            }}
          </span>
        </div>
        <div class="archive-actions">
          <Can permission="archive:template:sync">
            <a-button :disabled="!tree" @click="openTemplateSync">
              {{ t('archive.syncTemplate') }}
            </a-button>
          </Can>
          <Can permission="archive:upload">
            <a-button :disabled="!selectedFolder" type="primary" @click="openFolderUpload">
              {{ t('common.upload') }}
            </a-button>
          </Can>
        </div>
      </div>

      <a-spin :loading="loadingTree" class="archive-loading">
        <template v-if="tree">
          <a-empty v-if="!activeFolders.length" :description="t('archive.emptySnapshot')" />
          <div v-else class="archive-content">
            <aside class="folder-sidebar" :aria-label="t('archive.directoryAria')">
              <button
                v-for="folder in activeFolders"
                :key="folder.id"
                type="button"
                :class="['folder-entry', { active: folder.id === selectedFolderId }]"
                @click="selectedFolderId = folder.id"
              >
                <span>{{ folder.name }}</span>
                <small>{{ folder.completedCount }}/{{ folder.totalCount }}</small>
              </button>
            </aside>
            <section v-if="selectedFolder" class="file-panel">
              <header class="folder-heading">
                <div>
                  <h2>{{ selectedFolder.name }}</h2>
                  <p v-if="selectedFolder.description">
                    {{ selectedFolder.description }}
                  </p>
                </div>
                <span>{{ t('archive.selectedFileCount', { count: selectedFolder.totalCount }) }}</span>
              </header>
              <BusinessTable
                :data="selectedFolder.items"
                row-key="id"
                size="small"
                :scroll="{ x: 750 }"
                :empty-title="t('archive.emptyFolder')"
              >
                <template #columns>
                  <a-table-column :title="t('archive.columns.fileName')" :width="220" fixed="left">
                    <template #cell="{ record }">
                      <button
                        class="item-title"
                        :class="{
                          disabled:
                            !record.currentVersion || record.currentVersion.canPreview === false,
                        }"
                        type="button"
                        @click="previewItem(record)"
                      >
                        <span>{{ record.currentVersion?.displayName || record.name }}</span>
                      </button>
                    </template>
                  </a-table-column>
                  <a-table-column :title="t('archive.columns.version')" :width="80">
                    <template #cell="{ record }">
                      {{ record.currentVersion?.version || '—' }}
                    </template>
                  </a-table-column>
                  <a-table-column :title="t('archive.columns.fileSize')" :width="90">
                    <template #cell="{ record }">
                      {{ formatFileSize(record.currentVersion?.fileSize) }}
                    </template>
                  </a-table-column>
                  <a-table-column :title="t('archive.columns.uploader')" :width="90">
                    <template #cell="{ record }">
                      {{ record.currentVersion?.uploader?.realName || '—' }}
                    </template>
                  </a-table-column>
                  <a-table-column :title="t('archive.columns.uploadedAt')" :width="120">
                    <template #cell="{ record }">
                      {{ formatDate(record.currentVersion?.uploadedAt) }}
                    </template>
                  </a-table-column>
                  <a-table-column :title="t('common.action')" :width="150" fixed="right">
                    <template #cell="{ record }">
                      <a-space size="mini">
                        <a-button
                          v-if="record.canUpload"
                          type="text"
                          size="mini"
                          @click="openUpload(record)"
                        >
                          {{ t('archive.updateFile') }}
                        </a-button>
                        <a-button
                          v-if="record.currentVersion"
                          type="text"
                          size="mini"
                          @click="downloadItem(record)"
                        >
                          {{ t('common.download') }}
                        </a-button>
                        <a-button
                          v-if="record.canArchive"
                          type="text"
                          size="mini"
                          status="danger"
                          @click="archiveItem(record)"
                        >
                          {{ t('common.delete') }}
                        </a-button>
                        <a-button
                          v-if="record.canRestore"
                          type="text"
                          size="mini"
                          @click="restoreItem(record)"
                        >
                          {{ t('archive.restore') }}
                        </a-button>
                      </a-space>
                    </template>
                  </a-table-column>
                </template>
              </BusinessTable>
            </section>
          </div>
        </template>
        <a-empty v-else-if="!loadingTree" :description="t('archive.selectAccessibleProject')" />
      </a-spin>
    </section>

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
            :disabled="uploading"
            @change="handleUploadSelection"
          />
        </a-form-item>
        <a-grid :cols="2" :col-gap="16">
          <a-grid-item>
            <a-form-item :label="t('archive.uploadMode')">
              <a-radio-group v-model="uploadForm.uploadMode" type="button">
                <a-radio value="NEW_VERSION">
                  {{ t('archive.newVersion') }}
                </a-radio>
                <a-radio value="REPLACE">
                  {{ t('archive.replace') }}
                </a-radio>
              </a-radio-group>
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('archive.revisionLevel')">
              <a-radio-group v-model="uploadForm.revisionLevel" type="button">
                <a-radio value="MINOR">
                  {{ t('archive.minorVersion') }}
                </a-radio>
                <a-radio value="MAJOR">
                  {{ t('archive.majorVersion') }}
                </a-radio>
              </a-radio-group>
            </a-form-item>
          </a-grid-item>
        </a-grid>
        <a-form-item
          v-if="uploadItem?.allowMultipleFiles && uploadItem.currentVersion"
          :label="t('archive.multipleFileItem')"
        >
          <a-checkbox v-model="uploadForm.createAsNewFile">
            {{ t('archive.uploadAsIndependent') }}
          </a-checkbox>
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
        <div class="modal-actions">
          <a-button :disabled="uploading" @click="uploadVisible = false">
            {{ t('common.cancel') }}
          </a-button>
          <a-button type="primary" :loading="uploading" @click="submitUpload">
            {{ t('archive.confirmUpload') }}
          </a-button>
        </div>
      </a-form>
    </BusinessModal>

    <BusinessModal
      v-model:visible="syncVisible"
      :title="t('archive.syncTitle')"
      :width="680"
      :footer="false"
    >
      <a-spin :loading="syncLoading">
        <template v-if="templateDiff">
          <a-alert v-if="templateDiff.requiresMigration" type="warning">
            {{ templateDiff.reason || t('archive.migrationRequired') }}
          </a-alert>
          <a-result
            v-else-if="!templateDiff.hasDiff"
            status="success"
            :title="t('archive.alreadyLatest')"
          />
          <template v-else>
            <a-alert type="warning" class="modal-alert">
              {{ t('archive.syncHint') }}
            </a-alert>
            <div class="diff-summary">
              <span>{{
                t('archive.projectSnapshot', {
                  version: templateDiff.sourceVersion.version || t('archive.unmarked'),
                })
              }}</span>
              <span>{{
                t('archive.latestTemplate', {
                  version: templateDiff.latestVersion?.version || '—',
                })
              }}</span>
            </div>
            <a-descriptions :column="2" bordered size="small">
              <a-descriptions-item :label="t('archive.addedFolders')">
                {{ templateDiff.additions.folders.length }}
              </a-descriptions-item>
              <a-descriptions-item :label="t('archive.addedItems')">
                {{ templateDiff.additions.items.length }}
              </a-descriptions-item>
              <a-descriptions-item :label="t('archive.changedNotOverwritten')">
                {{ templateDiff.changes.folders.length + templateDiff.changes.items.length }}
              </a-descriptions-item>
              <a-descriptions-item :label="t('archive.projectOnly')">
                {{
                  templateDiff.projectOnly.folders.length + templateDiff.projectOnly.items.length
                }}
              </a-descriptions-item>
            </a-descriptions>
            <div v-if="templateDiff.additions.folders.length" class="diff-list">
              <strong>{{ t('archive.addedFolders') }}</strong>
              <a-tag v-for="item in templateDiff.additions.folders" :key="item.stableKey">
                {{ item.name }}
              </a-tag>
            </div>
            <div v-if="templateDiff.additions.items.length" class="diff-list">
              <strong>{{ t('archive.addedItems') }}</strong>
              <a-tag v-for="item in templateDiff.additions.items" :key="item.stableKey">
                {{ item.name }}
              </a-tag>
            </div>
          </template>
          <div class="modal-actions">
            <a-button :disabled="syncSaving" @click="syncVisible = false">
              {{ t('common.close') }}
            </a-button>
            <a-button
              v-if="templateDiff.canSync"
              type="primary"
              :loading="syncSaving"
              @click="confirmTemplateSync"
            >
              {{ t('archive.confirmAddOnlySync') }}
            </a-button>
          </div>
        </template>
      </a-spin>
    </BusinessModal>
  </PageContainer>
</template>

<style scoped lang="scss">
.archive-page {
  --archive-border: #e5e6eb;
  height: 100%;
  overflow: hidden;
  color: #1d2129;
  font-family: Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.modal-actions,
.diff-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.project-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

:deep(.summary-grid .stat-card) {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-color: var(--archive-border);
  border-radius: 2px;
  background: #fff;
}

:deep(.summary-grid .stat-card__label) {
  color: #4e5969;
  font-size: 14px;
  font-weight: 500;
}

:deep(.summary-grid .stat-card__value) {
  margin: 0 0 0 12px;
  font-size: 30px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.summary-grid small {
  color: var(--color-text-3);
}

.archive-workspace-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--archive-border);
  border-radius: 2px;
  background: #fff;
}

.archive-toolbar {
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  padding: 12px 16px;
  border-bottom: 1px solid var(--archive-border);
}

.archive-toolbar > :deep(.arco-select-view) {
  width: 320px;
}

.archive-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.project-meta {
  margin-left: auto;
  color: #4e5969;
  font-size: 13px;
}

.archive-loading {
  min-height: 0;
  display: flex;
  flex: 1;
  overflow: auto;
}

.archive-loading :deep(.arco-spin-children) {
  width: 100%;
  min-height: 100%;
  display: flex;
}

.archive-content {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
}

.folder-sidebar {
  min-height: 0;
  overflow-y: auto;
  padding: 8px 0;
  border-right: 1px solid var(--archive-border);
  background: #fafafa;
}

.folder-entry {
  width: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 16px;
  border: 0;
  background: transparent;
  color: #4e5969;
  cursor: pointer;
  text-align: left;
}

.folder-entry:hover,
.folder-entry.active {
  background: #e8f3ff;
  color: #165dff;
}

.folder-entry small {
  flex: 0 0 auto;
  color: #86909c;
}

.file-panel {
  min-width: 0;
  overflow: auto;
  padding: 16px;
}

.folder-heading {
  min-height: 54px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
}

.folder-heading h2 {
  margin: 0;
  font-size: 16px;
}

.folder-heading p {
  margin: 4px 0 0;
  color: #86909c;
  font-size: 12px;
}

.folder-heading > span {
  color: #4e5969;
  font-size: 13px;
}

.item-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--primary-6));
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.item-title.disabled {
  color: var(--color-text-1);
  cursor: default;
}

.modal-alert {
  margin-bottom: 16px;
}

.modal-actions {
  justify-content: flex-end;
  margin-top: 22px;
}

.diff-summary {
  margin: 16px 0;
  padding: 10px 12px;
  background: var(--color-fill-2);
  color: var(--color-text-2);
}

.diff-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}

@media (max-width: 1100px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

}

@media (max-width: 720px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .archive-content {
    grid-template-columns: 1fr;
  }

  .folder-sidebar {
    max-height: 180px;
    border-right: 0;
    border-bottom: 1px solid var(--archive-border);
  }
}
</style>
