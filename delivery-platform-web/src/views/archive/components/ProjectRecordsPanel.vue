<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { Message } from '@arco-design/web-vue'
import type { FileItem } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { attachmentApi } from '@/api/attachment'
import type { Attachment } from '@/api/attachment'
import { processRecordApi } from '@/api/process-record'
import {
  PROCESS_RECORD_TYPE_OPTIONS,
  type ProcessRecordPayload,
  type ProjectProcessRecord,
} from '@/types/process-record'
import { downloadBlob, openBlob } from '@/utils/blob'

const props = defineProps<{
  projectId: string
  projectName: string
}>()

const loading = ref(false)
const records = ref<ProjectProcessRecord[]>([])
const attachments = ref<Attachment[]>([])
const selectedFiles = ref<File[]>([])
const uploadFiles = ref<FileItem[]>([])
const dialogVisible = ref(false)
const filesVisible = ref(false)
const editingId = ref('')
const currentRecord = ref<ProjectProcessRecord>()
const recordType = ref('')
const keyword = ref('')
const form = ref<ProcessRecordPayload>(createEmptyForm())

function createEmptyForm(): ProcessRecordPayload {
  return {
    projectId: props.projectId,
    title: '',
    recordType: 'Progress',
    stageCode: '',
    recordDate: dayjs().format('YYYY-MM-DD'),
    description: '',
  }
}

async function fetchRecords(): Promise<void> {
  if (!props.projectId) {
    records.value = []
    return
  }
  loading.value = true
  try {
    const page = await processRecordApi.getList({
      page: 1,
      pageSize: 100,
      projectId: props.projectId,
      recordType: recordType.value || undefined,
      keyword: keyword.value || undefined,
    })
    records.value = page.list
  } finally {
    loading.value = false
  }
}

function openEditor(record?: ProjectProcessRecord): void {
  editingId.value = record?.id ?? ''
  selectedFiles.value = []
  uploadFiles.value = []
  form.value = record
    ? {
        projectId: record.projectId,
        title: record.title,
        recordType: record.recordType,
        stageCode: record.stageCode ?? '',
        recordDate: dayjs(record.recordDate).format('YYYY-MM-DD'),
        description: record.description ?? '',
      }
    : createEmptyForm()
  dialogVisible.value = true
}

function handleFileChange(files: FileItem[]): void {
  uploadFiles.value = files
  selectedFiles.value = files
    .map((item) => item.file)
    .filter((item): item is File => item !== undefined)
}

async function saveRecord(): Promise<void> {
  if (!form.value.title.trim()) {
    Message.warning('请填写记录标题')
    return
  }
  const record = editingId.value
    ? await processRecordApi.update(editingId.value, form.value)
    : await processRecordApi.create(form.value)

  if (selectedFiles.value.length > 0) {
    const data = new FormData()
    selectedFiles.value.forEach((file) => data.append('files', file))
    data.append('ownerType', 'ProjectProcessRecord')
    data.append('ownerId', record.id)
    data.append('projectId', record.projectId)
    data.append('category', 'project_record')
    data.append('captureSource', 'file')
    await attachmentApi.upload(data)
  }
  Message.success(editingId.value ? '记录已更新' : '记录已创建')
  dialogVisible.value = false
  await fetchRecords()
}

async function openFiles(record: ProjectProcessRecord): Promise<void> {
  currentRecord.value = record
  filesVisible.value = true
  const page = await attachmentApi.getList({
    ownerType: 'ProjectProcessRecord',
    ownerId: record.id,
    projectId: record.projectId,
    page: 1,
    pageSize: 100,
  })
  attachments.value = page.list
}

async function previewFile(file: Attachment): Promise<void> {
  openBlob(await attachmentApi.getContent(file.id))
}

async function downloadFile(file: Attachment): Promise<void> {
  downloadBlob(await attachmentApi.getContent(file.id), file.originalName)
}

async function removeRecord(record: ProjectProcessRecord): Promise<void> {
  await arcoConfirm(`确认删除“${record.title}”？`, '删除记录', {
    type: 'warning',
  })
  await processRecordApi.delete(record.id)
  Message.success('记录已删除')
  await fetchRecords()
}

watch(() => props.projectId, fetchRecords)
onMounted(fetchRecords)

defineExpose({ openEditor })
</script>

<template>
  <section class="records-panel">
    <div class="records-toolbar">
      <div class="records-filter">
        <a-select
          v-model="recordType"
          clearable
          placeholder="全部记录类型"
          class="filter-control"
          @change="fetchRecords"
        >
          <a-option
            v-for="item in PROCESS_RECORD_TYPE_OPTIONS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </a-select>
        <a-input
          v-model="keyword"
          clearable
          placeholder="搜索标题或说明"
          class="filter-control filter-control-wide"
          @keyup.enter="fetchRecords"
        />
        <a-button @click="fetchRecords">
          查询
        </a-button>
      </div>
      <a-button type="primary" @click="openEditor()">
        <a-icon><Upload /></a-icon>
        上传记录
      </a-button>
    </div>

    <a-table
      v-loading="loading"
      :data="records"
      border
      stripe
    >
      <a-table-column prop="recordDate" label="记录日期" :width="120">
        <template #default="{ row }">
          {{ dayjs(row.recordDate).format('YYYY-MM-DD') }}
        </template>
      </a-table-column>
      <a-table-column prop="title" label="记录标题" :min-width="220" />
      <a-table-column label="类型" :width="120">
        <template #default="{ row }">
          {{ PROCESS_RECORD_TYPE_OPTIONS.find((item) => item.value === row.recordType)?.label }}
        </template>
      </a-table-column>
      <a-table-column prop="creator.realName" label="记录人" :width="120" />
      <a-table-column
        prop="description"
        label="说明"
        :min-width="260"
        show-overflow-tooltip
      />
      <a-table-column label="操作" :width="190" fixed="right">
        <template #default="{ row }">
          <a-button text type="primary" @click="openFiles(row)">
            文件
          </a-button>
          <a-button text @click="openEditor(row)">
            编辑
          </a-button>
          <a-button text status="danger" type="secondary" @click="removeRecord(row)">
            删除
          </a-button>
        </template>
      </a-table-column>
    </a-table>
    <a-empty v-if="records.length === 0 && !loading" description="暂无项目过程记录" />

    <a-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑项目记录' : '上传项目记录'"
      width="720px"
      :close-on-click-modal="false"
    >
      <a-form :model="form" label-width="90px">
        <a-form-item label="项目">
          <a-input :model-value="projectName" disabled />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="记录类型">
              <a-select v-model="form.recordType">
                <a-option
                  v-for="item in PROCESS_RECORD_TYPE_OPTIONS"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="记录日期">
              <a-date-picker
                v-model="form.recordDate"
                type="date"
                value-format="YYYY-MM-DD"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="记录标题" required>
          <a-input v-model="form.title" :maxlength="200" show-word-limit />
        </a-form-item>
        <a-form-item label="记录说明">
          <a-textarea
            v-model="form.description"

            :rows="4"
            :maxlength="2000"
            show-word-limit
          />
        </a-form-item>
        <a-form-item label="图片/文件">
          <a-upload
            v-model:file-list="uploadFiles"
            action="#"
            multiple
            :auto-upload="false"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.mp4,.mov,.webm"
            :on-change="handleFileChange"
          >
            <a-button>
              <a-icon><Paperclip /></a-icon>
              选择图片或文件            </a-button>
            <template #tip>
              <div class="upload-tip">
                支持项目会议、进度、问题、交付文件及现场影像。              </div>
            </template>
          </a-upload>
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="dialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" @click="saveRecord">
          保存记录
        </a-button>
      </template>
    </a-dialog>

    <a-dialog
      v-model="filesVisible"
      :title="`${currentRecord?.title ?? ''} / 相关文件`"
      width="760px"
    >
      <a-table :data="attachments" border>
        <a-table-column prop="originalName" label="文件名" :min-width="320" />
        <a-table-column prop="uploader.realName" label="上传人" :width="120" />
        <a-table-column prop="createdAt" label="上传时间" :width="180">
          <template #default="{ row }">
            {{ dayjs(row.createdAt).format('YYYY-MM-DD HH:mm') }}
          </template>
        </a-table-column>
        <a-table-column label="操作" :width="140">
          <template #default="{ row }">
            <a-button text type="primary" @click="previewFile(row)">
              预览
            </a-button>
            <a-button text @click="downloadFile(row)">
              下载
            </a-button>
          </template>
        </a-table-column>
      </a-table>
      <a-empty v-if="attachments.length === 0" description="暂无相关文件" />
    </a-dialog>
  </section>
</template>

<style scoped lang="scss">
.records-panel {
  min-width: 0;
}

.records-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.records-filter {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.upload-tip {
  color: var(--app-text-muted);
  font-size: 12px;
}

@media (max-width: 760px) {
  .records-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
