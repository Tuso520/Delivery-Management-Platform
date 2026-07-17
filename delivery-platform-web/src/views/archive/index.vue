<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { archiveApi } from '@/api/archive'
import {
  BusinessModal,
  BusinessTable,
  Can,
  PageContainer,
  PageToolbar,
  SectionCard,
  StatCard,
  StatusBadge,
} from '@/components/business'
import {
  useArchiveProjectOptionsQuery,
  useArchiveTemplateDiffQuery,
  useArchiveTreeQuery,
} from '@/composables/queries/useArchiveQueries'
import { useProjectUserOptionsQuery } from '@/composables/queries/useProjectQueries'
import { useApprovalTemplatesQuery } from '@/composables/queries/useOperationsQueries'
import { useFilePreview } from '@/composables/useFilePreview'
import { queryKeys } from '@/query/keys'
import type { ProjectArchiveTargetFolder, ProjectArchiveTargetItem } from '@/types/archive'
import { arcoConfirm } from '@/utils/arco-dialog'

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

const temporaryVisible = ref(false)
const temporaryForm = reactive({
  folderId: '',
  name: '',
  description: '',
  reason: '',
  ownerUserId: '',
  required: false,
  reviewRequired: false,
  approvalTemplateId: '',
  suggestedForTemplate: false,
  allowMultipleFiles: false,
  allowedExtensions: '',
})

const syncVisible = ref(false)

const archiveProjectsQuery = useArchiveProjectOptionsQuery()
const archiveTreeQuery = useArchiveTreeQuery(selectedProjectId)
const archiveTemplateDiffQuery = useArchiveTemplateDiffQuery(selectedProjectId, syncVisible)
const archiveUserOptionsQuery = useProjectUserOptionsQuery('project-member')
const archiveApprovalTemplatesQuery = useApprovalTemplatesQuery({
  page: 1,
  pageSize: 100,
  businessType: 'PROJECT_ARCHIVE_FILE',
  enabled: true,
})
const projects = computed(() => archiveProjectsQuery.data.value?.items ?? [])
const tree = computed(() => archiveTreeQuery.data.value ?? null)
const templateDiff = computed(() => archiveTemplateDiffQuery.data.value ?? null)
const userOptions = computed(() => archiveUserOptionsQuery.data.value ?? [])
const approvalTemplateOptions = computed(
  () => archiveApprovalTemplatesQuery.data.value?.items ?? [],
)
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

const temporaryItemMutation = useMutation({
  mutationFn: ({
    projectId,
    folderId,
    data,
  }: {
    projectId: string
    folderId: string
    data: Parameters<typeof archiveApi.createTemporaryItem>[2]
  }) => archiveApi.createTemporaryItem(projectId, folderId, data),
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
const temporarySaving = computed(() => temporaryItemMutation.isPending.value)
const syncSaving = computed(() => templateSyncMutation.isPending.value)

function viewProject(): void {
  if (!selectedProjectId.value) return
  void router.push(`/projects/${selectedProjectId.value}`)
}

function folderProgress(folder: ProjectArchiveTargetFolder): number {
  return folder.totalCount > 0 ? Math.round((folder.completedCount / folder.totalCount) * 100) : 0
}

function normalizeArchiveStatus(status: string): string {
  return status ? status.toUpperCase() : 'NOT_STARTED'
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

async function openTemporaryItem(): Promise<void> {
  if (!activeFolders.value.length) {
    Message.warning(t('archive.messages.noAvailableFolder'))
    return
  }
  temporaryForm.folderId = activeFolders.value[0].id
  temporaryForm.name = ''
  temporaryForm.description = ''
  temporaryForm.reason = ''
  temporaryForm.ownerUserId = ''
  temporaryForm.required = false
  temporaryForm.reviewRequired = false
  temporaryForm.approvalTemplateId = ''
  temporaryForm.suggestedForTemplate = false
  temporaryForm.allowMultipleFiles = false
  temporaryForm.allowedExtensions = ''
  temporaryVisible.value = true
  if (!archiveUserOptionsQuery.data.value) await archiveUserOptionsQuery.refetch()
}

async function saveTemporaryItem(): Promise<void> {
  if (!selectedProjectId.value || !temporaryForm.folderId) return
  if (!temporaryForm.name.trim() || !temporaryForm.reason.trim() || !temporaryForm.ownerUserId) {
    Message.warning(t('archive.validation.temporaryRequired'))
    return
  }
  if (temporaryForm.reviewRequired && !temporaryForm.approvalTemplateId) {
    Message.warning(t('archive.validation.approvalTemplateRequired'))
    return
  }
  const extensions = temporaryForm.allowedExtensions
    .split(/[，,\s]+/u)
    .map((value) => value.replace(/^\./u, '').trim().toLowerCase())
    .filter(Boolean)
  await temporaryItemMutation.mutateAsync({
    projectId: selectedProjectId.value,
    folderId: temporaryForm.folderId,
    data: {
      name: temporaryForm.name.trim(),
      description: temporaryForm.description.trim() || undefined,
      reason: temporaryForm.reason.trim(),
      ownerUserId: temporaryForm.ownerUserId,
      required: temporaryForm.required,
      reviewRequired: temporaryForm.reviewRequired,
      approvalTemplateId: temporaryForm.reviewRequired
        ? temporaryForm.approvalTemplateId
        : undefined,
      suggestedForTemplate: temporaryForm.suggestedForTemplate,
      allowMultipleFiles: temporaryForm.allowMultipleFiles,
      allowedExtensions: extensions.length ? extensions : undefined,
    },
  })
  Message.success(t('archive.messages.temporaryCreated'))
  temporaryVisible.value = false
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
      void router.replace({
        path: route.path,
        query: { ...route.query, projectId: selectedProjectId.value },
      })
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
    </section>

    <section class="archive-workspace-panel">
      <PageToolbar class="archive-toolbar">
        <template #filters>
          <div class="project-picker">
            <span class="field-label">{{ t('archive.selectProject') }}</span>
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
            <a-button type="text" :disabled="!selectedProjectId" @click="viewProject">
              {{ t('archive.projectDetail') }}
            </a-button>
          </div>
        </template>
        <template #actions>
          <Can permission="archive:item:create_temporary">
            <a-button :disabled="!tree" @click="openTemporaryItem">
              {{ t('archive.temporaryCreate') }}
            </a-button>
          </Can>
          <Can permission="archive:template:sync">
            <a-button :disabled="!tree" type="primary" @click="openTemplateSync">
              {{ t('archive.syncTemplate') }}
            </a-button>
          </Can>
        </template>
      </PageToolbar>

      <div v-if="tree" class="project-meta">
        <span>{{ tree.project.code }}</span>
        <a-tag>
          {{
            tree.template.version
              ? t('archive.templateVersion', { version: tree.template.version })
              : t('archive.noTemplateVersion')
          }}
        </a-tag>
        <a-tag v-if="tree.template.hasDiff" color="orange">
          {{ t('archive.templateHasAdditions') }}
        </a-tag>
      </div>

      <a-spin :loading="loadingTree" class="archive-loading">
        <template v-if="tree">
          <a-empty v-if="!activeFolders.length" :description="t('archive.emptySnapshot')" />

          <section v-else class="folder-tree">
            <SectionCard
              v-for="folder in activeFolders"
              :key="folder.id"
              class="folder-card"
              :bordered="false"
            >
              <template #title>
                <div class="folder-title">
                  <div>
                    <strong>{{ folder.name }}</strong>
                    <span v-if="folder.description">{{ folder.description }}</span>
                  </div>
                  <div class="folder-progress">
                    <span>{{ folder.completedCount }} / {{ folder.totalCount }}</span>
                    <a-progress
                      size="small"
                      :percent="folderProgress(folder) / 100"
                      :show-text="false"
                    />
                  </div>
                </div>
              </template>

              <BusinessTable
                :data="folder.items"
                row-key="id"
                size="medium"
                :scroll="{ x: 960 }"
                :empty-title="t('archive.emptyFolder')"
              >
                <template #columns>
                  <a-table-column :title="t('archive.columns.itemName')" :width="280" fixed="left">
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
                        <span>{{ record.name }}</span>
                        <a-tag v-if="record.required" size="small" color="red">
                          {{ t('archive.required') }}
                        </a-tag>
                        <a-tag v-if="record.isTemporary" size="small">
                          {{ t('archive.temporary') }}
                        </a-tag>
                      </button>
                      <p v-if="record.description" class="item-description">
                        {{ record.description }}
                      </p>
                    </template>
                  </a-table-column>
                  <a-table-column :title="t('archive.columns.fileStatus')" :width="120">
                    <template #cell="{ record }">
                      <StatusBadge
                        domain="archive"
                        :status="normalizeArchiveStatus(record.status)"
                      />
                      <span v-if="record.pendingReviewSummary.count" class="review-count">
                        {{
                          t('archive.reviewTaskCount', {
                            count: record.pendingReviewSummary.count,
                          })
                        }}
                      </span>
                    </template>
                  </a-table-column>
                  <a-table-column :title="t('archive.columns.currentVersion')" :width="150">
                    <template #cell="{ record }">
                      <span v-if="record.currentVersion">
                        {{ record.currentVersion.version }}
                        <small v-if="record.fileCount > 1">{{
                          t('archive.fileCount', { count: record.fileCount })
                        }}</small>
                      </span>
                      <span v-else>—</span>
                    </template>
                  </a-table-column>
                  <a-table-column :title="t('archive.columns.owner')" :width="130">
                    <template #cell="{ record }">
                      {{
                        record.owner?.realName || record.owner?.username || t('archive.unassigned')
                      }}
                    </template>
                  </a-table-column>
                  <a-table-column :title="t('archive.columns.updatedAt')" :width="120">
                    <template #cell="{ record }">
                      {{ formatDate(record.updatedAt) }}
                    </template>
                  </a-table-column>
                  <a-table-column :title="t('common.action')" :width="180" fixed="right">
                    <template #cell="{ record }">
                      <a-space size="mini">
                        <a-button
                          v-if="record.canUpload"
                          type="text"
                          size="mini"
                          @click="openUpload(record)"
                        >
                          {{
                            record.currentVersion
                              ? t('archive.uploadNewVersion')
                              : t('common.upload')
                          }}
                        </a-button>
                        <a-button
                          v-if="record.canArchive"
                          type="text"
                          size="mini"
                          status="danger"
                          @click="archiveItem(record)"
                        >
                          {{ t('archive.archiveItem.action') }}
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
            </SectionCard>
          </section>
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
      v-model:visible="temporaryVisible"
      :title="t('archive.temporaryCreate')"
      :width="640"
      :footer="false"
    >
      <a-alert type="info" class="modal-alert">
        {{ t('archive.temporaryHint') }}
      </a-alert>
      <a-form :model="temporaryForm" layout="vertical">
        <a-form-item :label="t('archive.folder')" required>
          <a-select v-model="temporaryForm.folderId">
            <a-option v-for="folder in activeFolders" :key="folder.id" :value="folder.id">
              {{ folder.name }}
            </a-option>
          </a-select>
        </a-form-item>
        <a-grid :cols="2" :col-gap="16">
          <a-grid-item>
            <a-form-item :label="t('archive.columns.itemName')" required>
              <a-input v-model="temporaryForm.name" :max-length="200" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item :label="t('archive.columns.owner')" required>
              <a-select v-model="temporaryForm.ownerUserId" allow-search>
                <a-option
                  v-for="user in userOptions"
                  :key="user.id"
                  :value="user.id"
                  :label="user.displayName"
                />
              </a-select>
            </a-form-item>
          </a-grid-item>
        </a-grid>
        <a-form-item :label="t('common.description')">
          <a-textarea v-model="temporaryForm.description" />
        </a-form-item>
        <a-form-item :label="t('archive.createReason')" required>
          <a-textarea v-model="temporaryForm.reason" :max-length="500" show-word-limit />
        </a-form-item>
        <a-form-item :label="t('archive.allowedExtensions')">
          <a-input
            v-model="temporaryForm.allowedExtensions"
            :placeholder="t('archive.extensionsPlaceholder')"
          />
        </a-form-item>
        <a-form-item
          v-if="temporaryForm.reviewRequired"
          :label="t('archive.approvalTemplate')"
          required
        >
          <a-select
            v-model="temporaryForm.approvalTemplateId"
            allow-search
            :placeholder="t('archive.approvalTemplatePlaceholder')"
          >
            <a-option
              v-for="template in approvalTemplateOptions"
              :key="template.id"
              :value="template.id"
              :label="template.templateName"
            />
          </a-select>
        </a-form-item>
        <a-space wrap>
          <a-checkbox v-model="temporaryForm.required">
            {{ t('archive.required') }}
          </a-checkbox>
          <a-checkbox v-model="temporaryForm.reviewRequired">
            {{ t('archive.reviewRequired') }}
          </a-checkbox>
          <a-checkbox v-model="temporaryForm.allowMultipleFiles">
            {{ t('archive.allowMultipleFiles') }}
          </a-checkbox>
          <a-checkbox v-model="temporaryForm.suggestedForTemplate">
            {{ t('archive.suggestTemplate') }}
          </a-checkbox>
        </a-space>
        <div class="modal-actions">
          <a-button :disabled="temporarySaving" @click="temporaryVisible = false">
            {{ t('common.cancel') }}
          </a-button>
          <a-button type="primary" :loading="temporarySaving" @click="saveTemporaryItem">
            {{ t('common.create') }}
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

.folder-title,
.modal-actions,
.diff-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.project-picker,
.project-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.project-picker :deep(.arco-select-view) {
  width: 360px;
}

.field-label {
  color: var(--color-text-2);
  font-weight: 600;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
  flex: 0 0 auto;
  padding: 12px 16px;
  border-bottom: 1px solid var(--archive-border);
}

.archive-toolbar :deep(.page-toolbar__filters) {
  min-width: 0;
  flex: 1 1 auto;
  flex-wrap: nowrap;
}

.archive-toolbar :deep(.page-toolbar__actions) {
  flex: 0 0 auto;
  flex-wrap: nowrap;
  margin-left: auto;
}

.project-meta {
  min-height: 38px;
  flex: 0 0 auto;
  padding: 6px 16px;
  border-bottom: 1px solid var(--archive-border);
  background: #f7f8fa;
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
  display: grid;
  align-content: start;
  gap: 16px;
  padding: 12px 16px 16px;
}

.folder-tree,
.folder-card,
.folder-card :deep(.arco-card),
.folder-card :deep(.business-table) {
  width: 100%;
  min-width: 0;
}

.folder-tree {
  display: grid;
  gap: 12px;
}

.folder-card :deep(.arco-card-header) {
  min-height: 56px;
  border-bottom-color: var(--color-border-2);
}

.folder-card :deep(.arco-card-body) {
  padding: 0;
}

.folder-title {
  width: 100%;
}

.folder-title > div:first-child {
  display: grid;
  gap: 3px;
}

.folder-title span {
  color: var(--color-text-3);
  font-size: 12px;
  font-weight: 400;
}

.folder-progress {
  display: grid;
  grid-template-columns: auto 120px;
  align-items: center;
  gap: 10px;
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

.item-description {
  margin: 4px 0 0;
  color: var(--color-text-3);
  font-size: 12px;
}

.review-count {
  display: block;
  margin-top: 4px;
  color: var(--color-text-3);
  font-size: 12px;
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

  .archive-toolbar :deep(.page-toolbar__filters) {
    flex-wrap: wrap;
  }
}

@media (max-width: 720px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .project-picker {
    width: 100%;
    align-items: stretch;
    flex-direction: column;
  }

  .project-picker :deep(.arco-select-view) {
    width: 100%;
  }
}
</style>
