<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { useRouter } from 'vue-router'
import { checklistApi } from '@/api/checklist'
import { countryApi } from '@/api/country'
import { dictionaryApi } from '@/api/platform'
import type { Country } from '@/types/country'
import type { DictionaryItem } from '@/types/platform'
import type {
  ChecklistTemplate,
  QueryChecklistTemplateParams,
  CreateChecklistTemplateParams,
  UpdateChecklistTemplateParams,
} from '@/types/checklist'

const router = useRouter()

const loading = ref(false)
const templateList = ref<ChecklistTemplate[]>([])
const total = ref(0)
const countries = ref<Country[]>([])
const projectTypes = ref<DictionaryItem[]>([])
const stages = ref<DictionaryItem[]>([])
const queryParams = ref<QueryChecklistTemplateParams>({
  page: 1,
  pageSize: 20,
})

const dialogVisible = ref(false)
const isEdit = ref(false)
const currentId = ref('')
interface ChecklistTemplateForm {
  templateCode?: string
  templateName?: string
  countryCode?: string
  projectType?: string
  stageCode?: string
  version?: string
  status?: string
}

const formData = ref<ChecklistTemplateForm>({
  templateCode: '',
  templateName: '',
})

const rules = {
  templateCode: [{ required: true, message: '请输入模板编码', trigger: 'blur' }],
  templateName: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
}

const fetchTemplates = async () => {
  loading.value = true
  try {
    const res = await checklistApi.getTemplates(queryParams.value)
    templateList.value = res.list
    total.value = res.pagination.total
  } catch {
    Message.error('获取检查模板列表失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  queryParams.value.page = 1
  fetchTemplates()
}

const handlePageChange = (page: number) => {
  queryParams.value.page = page
  fetchTemplates()
}

const handleCreate = () => {
  isEdit.value = false
  currentId.value = ''
  formData.value = {
    templateCode: '',
    templateName: '',
  }
  dialogVisible.value = true
}

const handleEdit = (row: ChecklistTemplate) => {
  isEdit.value = true
  currentId.value = row.id
  formData.value = {
    templateName: row.templateName,
    countryCode: row.countryCode,
    projectType: row.projectType,
    stageCode: row.stageCode,
    version: row.version,
    status: row.status,
  }
  dialogVisible.value = true
}

const handleDelete = async (row: ChecklistTemplate) => {
  try {
    await arcoConfirm(`确定删除模板 "${row.templateName}" 吗？`, '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await checklistApi.deleteTemplate(row.id)
    Message.success('删除成功')
    fetchTemplates()
  } catch {
    // cancelled
  }
}

const handleSubmit = async () => {
  try {
    if (isEdit.value && currentId.value) {
      await checklistApi.updateTemplate(currentId.value, formData.value as UpdateChecklistTemplateParams)
      Message.success('更新成功')
    } else {
      await checklistApi.createTemplate(formData.value as CreateChecklistTemplateParams)
      Message.success('创建成功')
    }
    dialogVisible.value = false
    fetchTemplates()
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const err = error as { response?: { data?: { message?: string } } }
      Message.error(err.response?.data?.message || '操作失败')
    } else {
      Message.error('操作失败')
    }
  }
}

const handleViewItems = (row: ChecklistTemplate) => {
  router.push({ path: `/checklist/template/${row.id}` })
}

onMounted(async () => {
  const [countryPage, projectTypeDictionary, stageDictionary] = await Promise.all([
    countryApi.getList({ page: 1, pageSize: 100 }),
    dictionaryApi.getByCode('project_type'),
    dictionaryApi.getByCode('project_stage'),
  ])
  countries.value = countryPage.list
  projectTypes.value = projectTypeDictionary.items
  stages.value = stageDictionary.items
  await fetchTemplates()
})
</script>

<template>
  <div class="checklist-template-page">
    <!-- Search Bar -->
    <a-card class="search-card">
      <a-form :model="queryParams" inline>
        <a-form-item label="关键词">
          <a-input
            v-model="queryParams.keyword"
            placeholder="模板编码/名称"
            clearable
            style="width: 200px"
            @keyup.enter="handleSearch"
          />
        </a-form-item>
        <a-form-item>
          <a-button type="primary" @click="handleSearch">
            查询
          </a-button>
          <a-button @click="queryParams = { page: 1, pageSize: 20 }; fetchTemplates()">
            重置
          </a-button>
        </a-form-item>
      </a-form>
    </a-card>

    <!-- Toolbar -->
    <div class="toolbar">
      <a-button type="primary" @click="handleCreate">
        新建模板
      </a-button>
    </div>

    <!-- Table -->
    <a-card>
      <a-table
        v-loading="loading"
        :data="templateList"
        border
        stripe
        style="width: 100%"
      >
        <a-table-column prop="templateCode" label="模板编码" :width="160" />
        <a-table-column prop="templateName" label="模板名称" :min-width="200" />
        <a-table-column prop="countryCode" label="国家" :width="80" />
        <a-table-column prop="projectType" label="项目类型" :width="120" />
        <a-table-column prop="stageCode" label="阶段" :width="100" />
        <a-table-column prop="version" label="版本" :width="80" />
        <a-table-column
          prop="itemCount"
          label="检查项数"
          :width="90"
          align="center"
        />
        <a-table-column prop="status" label="状态" :width="80">
          <template #default="{ row }">
            <a-tag :type="row.status === 'Active' ? 'success' : 'info'" size="small">
              {{ row.status === 'Active' ? '启用' : '停用' }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column prop="createdAt" label="创建时间" :width="170" />
        <a-table-column label="操作" :width="220" fixed="right">
          <template #default="{ row }">
            <a-button
              type="primary"
              text
              size="small"
              @click="handleViewItems(row)"
            >
              检查项
            </a-button>
            <a-button
              type="primary"
              text
              size="small"
              @click="handleEdit(row)"
            >
              编辑
            </a-button>
            <a-button
              status="danger" type="secondary"
              text
              size="small"
              @click="handleDelete(row)"
            >
              删除
            </a-button>
          </template>
        </a-table-column>
      </a-table>

      <div class="pagination-wrapper">
        <a-pagination
          v-model:current-page="queryParams.page"
          v-model:page-size="queryParams.pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </a-card>

    <!-- Create/Edit Dialog -->
    <a-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑模板' : '新建模板'"
      width="520px"
      :close-on-click-modal="false"
    >
      <a-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-width="100px"
      >
        <a-form-item v-if="!isEdit" label="模板编码" prop="templateCode">
          <a-input v-model="formData.templateCode" :maxlength="50" />
        </a-form-item>
        <a-form-item label="模板名称" prop="templateName">
          <a-input v-model="formData.templateName" :maxlength="100" />
        </a-form-item>
        <a-form-item label="适用国家">
          <a-select
            v-model="formData.countryCode"
            clearable
            filterable
            style="width:100%"
          >
            <a-option
              v-for="item in countries"
              :key="item.id"
              :label="item.nameZh"
              :value="item.countryCode"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="项目类型">
          <a-select v-model="formData.projectType" clearable style="width:100%">
            <a-option
              v-for="item in projectTypes"
              :key="item.id"
              :label="item.itemLabel"
              :value="item.itemValue"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="适用阶段">
          <a-select v-model="formData.stageCode" clearable style="width:100%">
            <a-option
              v-for="item in stages"
              :key="item.id"
              :label="item.itemLabel"
              :value="item.itemValue"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="版本号">
          <a-input v-model="formData.version" :maxlength="10" placeholder="默认 V1.0" />
        </a-form-item>
        <a-form-item v-if="isEdit" label="状态">
          <a-select v-model="formData.status">
            <a-option label="启用" value="Active" />
            <a-option label="停用" value="Inactive" />
          </a-select>
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="dialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" @click="handleSubmit">
          确定
        </a-button>
      </template>
    </a-dialog>
  </div>
</template>
