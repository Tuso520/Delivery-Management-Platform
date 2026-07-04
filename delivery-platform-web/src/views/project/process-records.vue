<script setup lang="ts">
import { onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'

import { attachmentApi } from '@/api/attachment'
import type { Attachment } from '@/api/attachment'
import { processRecordApi } from '@/api/process-record'
import { projectApi } from '@/api/project'
import type { Project } from '@/types/project'
import {
  PROCESS_RECORD_TYPE_OPTIONS,
  type ProcessRecordPayload,
  type ProjectProcessRecord,
} from '@/types/process-record'
import { downloadBlob, openBlob } from '@/utils/blob'

const loading = ref(false)
const records = ref<ProjectProcessRecord[]>([])
const projects = ref<Project[]>([])
const attachments = ref<Attachment[]>([])
const selectedFiles = ref<File[]>([])
const dialogVisible = ref(false)
const filesVisible = ref(false)
const editingId = ref('')
const currentRecord = ref<ProjectProcessRecord>()
const query = ref({
  page: 1,
  pageSize: 20,
  projectId: '',
  recordType: '',
  keyword: '',
})
const pagination = ref({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
const form = ref<ProcessRecordPayload>({
  projectId: '',
  title: '',
  recordType: 'Progress',
  stageCode: '',
  recordDate: dayjs().format('YYYY-MM-DD'),
  description: '',
})

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [page, projectPage] = await Promise.all([
      processRecordApi.getList({
        ...query.value,
        projectId: query.value.projectId || undefined,
        recordType: query.value.recordType || undefined,
        keyword: query.value.keyword || undefined,
      }),
      projectApi.getList({ page: 1, pageSize: 200 }),
    ])
    records.value = page.list
    pagination.value = page.pagination
    projects.value = projectPage.list
  } finally {
    loading.value = false
  }
}

function openEditor(record?: ProjectProcessRecord): void {
  editingId.value = record?.id ?? ''
  selectedFiles.value = []
  form.value = record
    ? {
        projectId: record.projectId,
        title: record.title,
        recordType: record.recordType,
        stageCode: record.stageCode ?? '',
        recordDate: dayjs(record.recordDate).format('YYYY-MM-DD'),
        description: record.description ?? '',
      }
    : {
        projectId: query.value.projectId || projects.value[0]?.id || '',
        title: '',
        recordType: 'Progress',
        stageCode: '',
        recordDate: dayjs().format('YYYY-MM-DD'),
        description: '',
      }
  dialogVisible.value = true
}

function selectFiles(event: Event): void {
  selectedFiles.value = Array.from(
    (event.target as HTMLInputElement).files ?? [],
  )
}

async function saveRecord(): Promise<void> {
  if (!form.value.projectId || !form.value.title) {
    Message.warning('请选择项目并填写记录标题')
    return
  }
  const record = editingId.value
    ? await processRecordApi.update(editingId.value, form.value)
    : await processRecordApi.create(form.value)

  if (selectedFiles.value.length) {
    const data = new FormData()
    selectedFiles.value.forEach((file) => data.append('files', file))
    data.append('ownerType', 'ProjectProcessRecord')
    data.append('ownerId', record.id)
    data.append('projectId', record.projectId)
    data.append('category', 'document')
    data.append('captureSource', 'file')
    await attachmentApi.upload(data)
  }
  Message.success(editingId.value ? '过程记录已更新' : '过程记录已创建')
  dialogVisible.value = false
  await fetchData()
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
  await fetchData()
}

onMounted(fetchData)
</script>

<template>
  <section class="process-page">
    <div class="page-toolbar">
      <div>
        <h2>项目过程记录</h2>
        <p>按项目记录会议、进度、问题和现场文件影像，减少重复检查表填写。</p>
      </div>
      <a-button type="primary" @click="openEditor()">
        <a-icon><Plus /></a-icon>
        新建记录
      </a-button>
    </div>

    <a-form :model="query" inline class="filter-bar">
      <a-form-item label="项目">
        <a-select
          v-model="query.projectId"
          clearable
          filterable
          @change="fetchData"
        >
          <a-option
            v-for="project in projects"
            :key="project.id"
            :label="`${project.projectCode} / ${project.projectName}`"
            :value="project.id"
          />
        </a-select>
      </a-form-item>
      <a-form-item label="类型">
        <a-select v-model="query.recordType" clearable @change="fetchData">
          <a-option
            v-for="item in PROCESS_RECORD_TYPE_OPTIONS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </a-select>
      </a-form-item>
      <a-form-item>
        <a-input
          v-model="query.keyword"
          clearable
          placeholder="标题或说明"
          @keyup.enter="fetchData"
        />
      </a-form-item>
      <a-button type="primary" @click="fetchData">
        查询
      </a-button>
    </a-form>

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
      <a-table-column prop="project.projectName" label="项目" :min-width="190" />
      <a-table-column prop="title" label="记录标题" :min-width="200" />
      <a-table-column label="类型" :width="110">
        <template #default="{ row }">
          {{ PROCESS_RECORD_TYPE_OPTIONS.find((item) => item.value === row.recordType)?.label }}
        </template>
      </a-table-column>
      <a-table-column prop="creator.realName" label="记录人" :width="100" />
      <a-table-column
        prop="description"
        label="说明"
        :min-width="220"
        show-overflow-tooltip
      />
      <a-table-column label="操作" :width="210" fixed="right">
        <template #default="{ row }">
          <a-button text type="primary" @click="openFiles(row)">
            文件
          </a-button>
          <a-button text type="primary" @click="openEditor(row)">
            编辑
          </a-button>
          <a-button text status="danger" type="secondary" @click="removeRecord(row)">
            删除
          </a-button>
        </template>
      </a-table-column>
    </a-table>

    <a-dialog v-model="dialogVisible" :title="editingId ? '编辑过程记录' : '新建过程记录'" width="680px">
      <a-form :model="form" label-width="90px">
        <a-row :gutter="16">
          <a-col :span="14">
            <a-form-item label="项目" required>
              <a-select
                v-model="form.projectId"
                filterable
                style="width: 100%"
                :disabled="Boolean(editingId)"
              >
                <a-option
                  v-for="project in projects"
                  :key="project.id"
                  :label="`${project.projectCode} / ${project.projectName}`"
                  :value="project.id"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="10">
            <a-form-item label="记录日期">
              <a-date-picker v-model="form.recordDate" type="date" value-format="YYYY-MM-DD" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="10">
            <a-form-item label="类型">
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
          <a-col :span="14">
            <a-form-item label="标题" required>
              <a-input v-model="form.title" :maxlength="200" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="说明">
          <a-textarea
            v-model="form.description"

            :rows="4"
            :maxlength="2000"
          />
        </a-form-item>
        <a-form-item label="相关文件">
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.mp4,.mov,.webm"
            @change="selectFiles"
          />
        </a-form-item>
        <a-form-item label="直接拍照">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            @change="selectFiles"
          />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="dialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" @click="saveRecord">
          保存
        </a-button>
      </template>
    </a-dialog>

    <a-dialog v-model="filesVisible" :title="`${currentRecord?.title ?? ''} / 文件`" width="720px">
      <a-table :data="attachments" border>
        <a-table-column prop="originalName" label="文件名" :min-width="280" />
        <a-table-column prop="uploader.realName" label="上传人" :width="110" />
        <a-table-column prop="createdAt" label="上传时间" :width="180" />
        <a-table-column label="操作" :width="130">
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
.process-page {
  min-width: 0;
}
@media (max-width: 720px) {
  .page-toolbar { align-items: flex-start; flex-direction: column; }
}
</style>
