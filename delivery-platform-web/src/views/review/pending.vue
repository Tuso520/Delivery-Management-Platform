<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { reviewApi } from '@/api/review'
import AttachmentPreviewModal from '@/components/AttachmentPreviewModal/index.vue'
import type { PendingReview } from '@/types/file'
import ReviewDialog from './components/ReviewDialog.vue'

const loading = ref(false)
const reviewList = ref<PendingReview[]>([])
const reviewDialogVisible = ref(false)
const selectedFileId = ref<string>('')
const selectedFileName = ref<string>('')
const previewVisible = ref(false)
const previewTarget = ref<PendingReview | null>(null)

async function fetchPendingReviews() {
  loading.value = true
  try {
    reviewList.value = await reviewApi.getPending()
  } catch {
    // Error handled by interceptor
  } finally {
    loading.value = false
  }
}

function openReviewDialog(fileId: string, fileName: string) {
  selectedFileId.value = fileId
  selectedFileName.value = fileName
  reviewDialogVisible.value = true
}

function openPreview(row: PendingReview) {
  previewTarget.value = row
  previewVisible.value = true
}

function handleReviewComplete() {
  reviewDialogVisible.value = false
  Message.success('审核完成')
  fetchPendingReviews()
}

onMounted(fetchPendingReviews)
</script>

<template>
  <div class="pending-review-page">
    <div class="page-header">
      <h2>待审核文件</h2>
    </div>

    <a-card>
      <a-table
        v-loading="loading"
        :data="reviewList"
        border
        stripe
        empty-text="暂无待审核文件"
      >
        <a-table-column label="文件名" :min-width="200">
          <template #default="{ row }">
            <div class="file-info">
              <a-icon><Document /></a-icon>
              <button class="file-preview-link" type="button" @click="openPreview(row)">
                {{ row.file.fileName }}
              </button>
            </div>
          </template>
        </a-table-column>
        <a-table-column label="版本" :width="80" align="center">
          <template #default="{ row }">
            {{ row.file.versionNo }}
          </template>
        </a-table-column>
        <a-table-column label="档案目录项" :min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.archiveItem.name }}
          </template>
        </a-table-column>
        <a-table-column label="项目" :min-width="180">
          <template #default="{ row }">
            <div class="project-info">
              <span class="project-name">{{ row.file.project?.projectName || '-' }}</span>
              <span v-if="row.file.project?.projectCode" class="project-code">
                {{ row.file.project.projectCode }}
              </span>
            </div>
          </template>
        </a-table-column>
        <a-table-column label="审核人" :width="120">
          <template #default="{ row }">
            {{ row.reviewer.realName }}
          </template>
        </a-table-column>
        <a-table-column label="提交时间" :width="170">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleString('zh-CN') }}
          </template>
        </a-table-column>
        <a-table-column label="状态" :width="100" align="center">
          <template #default>
            <a-tag color="orange" size="small">
              待审核
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column label="操作" :width="150" fixed="right">
          <template #default="{ row }">
            <a-space size="mini" :wrap="false">
              <a-button type="text" size="small" @click="openPreview(row)">预览</a-button>
              <a-button
                type="primary"
                size="small"
                @click="openReviewDialog(row.fileId, row.file.fileName)"
              >
                审核
              </a-button>
            </a-space>
          </template>
        </a-table-column>
      </a-table>
    </a-card>

    <ReviewDialog
      v-model:visible="reviewDialogVisible"
      :file-id="selectedFileId"
      :file-name="selectedFileName"
      @review-complete="handleReviewComplete"
    />

    <AttachmentPreviewModal
      v-model:visible="previewVisible"
      source="file"
      :attachment-id="previewTarget?.fileId"
      :title="previewTarget?.file.fileName || '文件预览'"
    />
  </div>
</template>

<style scoped lang="scss">
.page-header {
  margin-bottom: 20px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.file-preview-link {
  min-width: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  color: rgb(var(--primary-6));
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  line-height: 1.25;
}

.project-name {
  overflow: hidden;
  color: var(--color-text-1);
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-code {
  color: var(--color-text-3);
  font-size: 12px;
}
</style>
