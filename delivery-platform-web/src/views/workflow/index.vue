<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { workflowApi } from '@/api/workflow'
import { roleApi } from '@/api/role'
import type { Role } from '@/types/role'
import type {
  WorkflowCategory,
  WorkflowDocumentSummary,
  CreateWorkflowCategoryParams,
  CreateWorkflowDocumentParams,
} from '@/types/workflow'

const router = useRouter()

const loading = ref(false)
const categories = ref<WorkflowCategory[]>([])
const activeCategoryId = ref('')
const currentDocs = ref<WorkflowDocumentSummary[]>([])
const roles = ref<Role[]>([])

// Category dialog
const categoryDialogVisible = ref(false)
const categoryForm = ref<CreateWorkflowCategoryParams>({
  name: '',
})

// Document dialog
const docDialogVisible = ref(false)
const docForm = ref<CreateWorkflowDocumentParams>({
  categoryId: '',
  name: '',
})

const categoryRules = {
  name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }],
}

const docRules = {
  name: [{ required: true, message: '请输入文档名称', trigger: 'blur' }],
}

const fetchCategories = async () => {
  try {
    categories.value = await workflowApi.getCategories()
    if (categories.value.length > 0 && !activeCategoryId.value) {
      activeCategoryId.value = categories.value[0].id
    }
    switchCategory(activeCategoryId.value)
  } catch {
    Message.error('获取分类列表失败')
  }
}

const switchCategory = (categoryId: string) => {
  activeCategoryId.value = categoryId
  const category = categories.value.find((c) => c.id === categoryId)
  currentDocs.value = category?.documents || []
}

const activeCategory = computed(() => {
  return categories.value.find((c) => c.id === activeCategoryId.value)
})

// Category CRUD
const handleCreateCategory = () => {
  categoryForm.value = { name: '' }
  categoryDialogVisible.value = true
}

const handleCategorySubmit = async () => {
  try {
    await workflowApi.createCategory(categoryForm.value)
    Message.success('创建成功')
    categoryDialogVisible.value = false
    fetchCategories()
  } catch {
    Message.error('创建失败')
  }
}

const handleDeleteCategory = async (id: string) => {
  try {
    await arcoConfirm('确定删除该分类吗？', '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await workflowApi.deleteCategory(id)
    Message.success('删除成功')
    fetchCategories()
  } catch {
    // cancelled
  }
}

// Document CRUD
const handleCreateDoc = () => {
  docForm.value = {
    categoryId: activeCategoryId.value,
    name: '',
  }
  docDialogVisible.value = true
}

const handleDocSubmit = async () => {
  try {
    await workflowApi.createDocument(docForm.value)
    Message.success('创建成功')
    docDialogVisible.value = false
    fetchCategories()
  } catch {
    Message.error('创建失败')
  }
}

const handleDeleteDoc = async (id: string) => {
  try {
    await arcoConfirm('确定删除该文档吗？', '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await workflowApi.deleteDocument(id)
    Message.success('删除成功')
    fetchCategories()
  } catch {
    // cancelled
  }
}

const handleViewDoc = (id: string) => {
  router.push({ path: `/workflow/detail/${id}` })
}

onMounted(async () => {
  roles.value = await roleApi.getList()
  await fetchCategories()
})
</script>

<template>
  <div class="workflow-page">
    <!-- Toolbar -->
    <div class="toolbar">
      <a-button type="primary" @click="handleCreateCategory">
        新建分类
      </a-button>
      <a-button
        type="primary"
        plain
        :disabled="!activeCategoryId"
        @click="handleCreateDoc"
      >
        新建文档
      </a-button>
    </div>

    <a-row :gutter="16">
      <!-- Category Sidebar -->
      <a-col :span="6">
        <a-card>
          <template #header>
            <span class="card-title">流程分类</span>
          </template>
          <div class="category-list">
            <div
              v-for="cat in categories"
              :key="cat.id"
              class="category-item"
              :class="{ active: cat.id === activeCategoryId }"
              @click="switchCategory(cat.id)"
            >
              <div class="category-info">
                <span class="category-name">{{ cat.name }}</span>
                <a-tag size="small" color="gray" class="category-count">
                  {{ cat._count?.documents || 0 }}
                </a-tag>
              </div>
              <a-button
                status="danger" type="secondary"
                text
                size="small"
                @click.stop="handleDeleteCategory(cat.id)"
              >
                删除
              </a-button>
            </div>
            <div v-if="categories.length === 0" class="empty-category">
              暂无分类
            </div>
          </div>
        </a-card>
      </a-col>

      <!-- Document List -->
      <a-col :span="18">
        <a-card>
          <template #header>
            <span class="card-title">
              {{ activeCategory?.name || '请选择分类' }}
            </span>
          </template>

          <a-table
            v-loading="loading"
            :data="currentDocs"
            border
            stripe
            style="width: 100%"
          >
            <a-table-column prop="name" label="文档名称" :min-width="200" />
            <a-table-column prop="responsibleRole" label="负责角色" :width="120" />
            <a-table-column prop="version" label="版本" :width="80" />
            <a-table-column prop="status" label="状态" :width="80">
              <template #default="{ row }">
                <a-tag
                  :type="row.status === 'Active' ? 'success' : 'info'"
                  size="small"
                >
                  {{ row.status === 'Active' ? '启用' : '停用' }}
                </a-tag>
              </template>
            </a-table-column>
            <a-table-column prop="createdAt" label="创建时间" :width="170" />
            <a-table-column label="操作" :width="160" fixed="right">
              <template #default="{ row }">
                <a-button
                  type="primary"
                  text
                  size="small"
                  @click="handleViewDoc(row.id)"
                >
                  查看
                </a-button>
                <a-button
                  status="danger" type="secondary"
                  text
                  size="small"
                  @click="handleDeleteDoc(row.id)"
                >
                  删除
                </a-button>
              </template>
            </a-table-column>
          </a-table>

          <div v-if="currentDocs.length === 0" class="empty-docs">
            该分类下暂无文档
          </div>
        </a-card>
      </a-col>
    </a-row>

    <!-- Create Category Dialog -->
    <a-dialog
      v-model="categoryDialogVisible"
      title="新建分类"
      width="420px"
      :close-on-click-modal="false"
    >
      <a-form
        ref="categoryFormRef"
        :model="categoryForm"
        :rules="categoryRules"
        label-width="80px"
      >
        <a-form-item label="分类名称" prop="name">
          <a-input v-model="categoryForm.name" :maxlength="100" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="categoryDialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" @click="handleCategorySubmit">
          确定
        </a-button>
      </template>
    </a-dialog>

    <!-- Create Document Dialog -->
    <a-dialog
      v-model="docDialogVisible"
      title="新建流程文档"
      width="600px"
      :close-on-click-modal="false"
    >
      <a-form
        ref="docFormRef"
        :model="docForm"
        :rules="docRules"
        label-width="100px"
      >
        <a-form-item label="文档名称" prop="name">
          <a-input v-model="docForm.name" :maxlength="200" />
        </a-form-item>
        <a-form-item label="负责角色">
          <a-select
            v-model="docForm.responsibleRole"
            clearable
            filterable
            style="width:100%"
          >
            <a-option
              v-for="role in roles"
              :key="role.id"
              :label="role.roleName"
              :value="role.roleCode"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="版本号">
          <a-input v-model="docForm.version" :maxlength="10" placeholder="默认 V1.0" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="docDialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" @click="handleDocSubmit">
          确定
        </a-button>
      </template>
    </a-dialog>
  </div>
</template>

<style scoped lang="scss">
.card-title {
  font-weight: 600;
  font-size: 14px;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.category-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f0f5f2;
  }

  &.active {
    background-color: #e8f3ff;
    color: #165dff;
    font-weight: 600;
  }
}

.category-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.category-name {
  font-size: 13px;
}

.category-count {
  min-width: 20px;
  text-align: center;
}

.empty-category,
.empty-docs {
  padding: 24px;
  text-align: center;
  color: #9aa49f;
  font-size: 13px;
}
</style>
