<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { dictionaryApi } from '@/api/platform'
import { templateApi } from '@/api/template'
import { attachmentApi } from '@/api/attachment'
import type { DictionaryItem } from '@/types/platform'
import type { DocumentTemplate, QueryTemplateDto } from '@/types/template'
import type { PaginatedData } from '@/types/api'
import type { TagType } from '@/types/ui'
import { downloadBlob } from '@/utils/blob'

const router = useRouter()

const loading = ref(false)
const templateList = ref<DocumentTemplate[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const categoryOptions = ref<DictionaryItem[]>([])

const filterCategory = ref('')
const filterStatus = ref('')

const statusOptions = [
  { value: 'Draft', label: '草稿' },
  { value: 'Published', label: '已发布 '},
  { value: 'Deprecated', label: '已废弃 '},
]

const fetchList = async () => {
  loading.value = true
  try {
    const params: QueryTemplateDto = { page: page.value, pageSize: pageSize.value }
    if (filterCategory.value) params.category = filterCategory.value
    if (filterStatus.value) params.status = filterStatus.value
    const res = await templateApi.getList(params)
    const data = res as PaginatedData<DocumentTemplate>
    templateList.value = data.list
    total.value = data.pagination.total
  } catch {
    templateList.value = []
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  router.push('/template/create')
}

const handleEdit = (row: DocumentTemplate) => {
  router.push(`/template/${row.id}`)
}

const handleDelete = async (row: DocumentTemplate) => {
  try {
    await arcoConfirm(`确定删除模板"${row.name}"吗？`, '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await templateApi.delete(row.id)
    Message.success('删除成功')
    fetchList()
  } catch {
    // cancelled
  }
}

const handlePublish = async (row: DocumentTemplate) => {
  try {
    await templateApi.publish(row.id)
    Message.success('发布成功')
    fetchList()
  } catch {
    // error
  }
}

const handleDownload = async (row: DocumentTemplate) => {
  try {
    const download = await templateApi.getDownloadInfo(row.id)
    const content = download.attachmentId
      ? await attachmentApi.getContent(download.attachmentId)
      : new Blob([download.generatedContent || ''], {
          type: 'text/markdown;charset=utf-8',
        })
    downloadBlob(content, download.fileName)
  } catch {
    Message.warning('该模板尚未上传可下载文件')
  }
}

const handlePageChange = (val: number) => {
  page.value = val
  fetchList()
}

const statusTagType = (status: string): TagType => {
  const map: Record<string, TagType> = {
    Draft: 'info',
    Published: 'success',
    Deprecated: 'danger',
  }
  return map[status] || 'info'
}

onMounted(async () => {
  categoryOptions.value = (await dictionaryApi.getByCode('template_category')).items
  await fetchList()
})
</script>

<template>
  <div class="template-page">
    <a-card class="filter-card">
      <a-form :model="{ category: filterCategory, status: filterStatus }" inline>
        <a-form-item label="分类">
          <a-select
            v-model="filterCategory"
            placeholder="鍏ㄩ儴"
            clearable
            style="width:150px"
            @change="fetchList"
          >
            <a-option
              v-for="opt in categoryOptions"
              :key="opt.id"
              :label="opt.itemLabel"
              :value="opt.itemValue"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="状态">
          <a-select
            v-model="filterStatus"
            placeholder="鍏ㄩ儴"
            clearable
            style="width:130px"
            @change="fetchList"
          >
            <a-option
              v-for="opt in statusOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </a-select>
        </a-form-item>
        <a-form-item>
          <a-button type="primary" @click="fetchList">
            查询
          </a-button>
        </a-form-item>
      </a-form>
    </a-card>

    <a-card class="table-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">模板列表</span>
          <a-button type="primary" @click="handleCreate">
            创建模板
          </a-button>
        </div>
      </template>

      <a-table
        v-loading="loading"
        :data="templateList"
        border
        stripe
      >
        <a-table-column prop="templateNo" label="模板编号" :width="200" />
        <a-table-column
          prop="name"
          label="模板名称"
          :min-width="200"
          show-overflow-tooltip
        />
        <a-table-column prop="category" label="分类" :width="100" />
        <a-table-column prop="language" label="语言" :width="80" />
        <a-table-column prop="fileFormat" label="格式" :width="70" />
        <a-table-column label="状态" :width="90">
          <template #default="{ row }">
            <a-tag :type="statusTagType(row.status)" size="small">
              {{ statusOptions.find(o => o.value === row.status)?.label || row.status }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column prop="publishedAt" label="发布时间" :width="170" />
        <a-table-column label="操作" :width="250" fixed="right">
          <template #default="{ row }">
            <a-button
              v-if="row.status === 'Published'"
              text
              type="primary"
              size="small"
              @click="handleDownload(row)"
            >
              下载
            </a-button>
            <a-button
              text
              type="primary"
              size="small"
              @click="handleEdit(row)"
            >
              编辑
            </a-button>
            <a-button
              v-if="row.status === 'Draft'"
              text
              status="success" type="secondary"
              size="small"
              @click="handlePublish(row)"
            >
              发布
            </a-button>
            <a-button
              text
              status="danger" type="secondary"
              size="small"
              @click="handleDelete(row)"
            >
              删除
            </a-button>
          </template>
        </a-table-column>
      </a-table>

      <div v-if="total > 0" class="pagination-wrapper">
        <a-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </a-card>
  </div>
</template>
