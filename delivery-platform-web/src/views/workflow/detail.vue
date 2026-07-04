<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { workflowApi } from '@/api/workflow'
import { roleApi } from '@/api/role'
import type { WorkflowDocument } from '@/types/workflow'
import type { Role } from '@/types/role'

const route = useRoute()
const router = useRouter()
const docId = route.params.id as string

const loading = ref(false)
const doc = ref<WorkflowDocument | null>(null)
const roles = ref<Role[]>([])
const editVisible = ref(false)
const editForm = ref({
  name: '',
  responsibleRole: '',
  applicableScope: '',
  triggerCondition: '',
  inputMaterials: '',
  outputMaterials: '',
  steps: '',
  riskNotes: '',
  status: 'Active',
})

const fetchDoc = async () => {
  loading.value = true
  try {
    doc.value = await workflowApi.getDocumentById(docId)
  } catch {
    Message.error('获取流程文档失败')
  } finally {
    loading.value = false
  }
}

const formatJsonText = (text: string | undefined | null): string => {
  if (!text) return '-'
  return text
}

const handleEdit = () => {
  if (!doc.value) return
  editForm.value = {
    name: doc.value.name,
    responsibleRole: doc.value.responsibleRole ?? '',
    applicableScope: doc.value.applicableScope ?? '',
    triggerCondition: doc.value.triggerCondition ?? '',
    inputMaterials: doc.value.inputMaterials ?? '',
    outputMaterials: doc.value.outputMaterials ?? '',
    steps: doc.value.steps ?? '',
    riskNotes: doc.value.riskNotes ?? '',
    status: doc.value.status,
  }
  editVisible.value = true
}

const handleSave = async () => {
  await workflowApi.updateDocument(docId, editForm.value)
  Message.success('流程文档已更新')
  editVisible.value = false
  await fetchDoc()
}

const handleBack = () => {
  router.push({ path: '/workflow' })
}

onMounted(async () => {
  roles.value = await roleApi.getList()
  await fetchDoc()
})
</script>

<template>
  <div class="workflow-detail-page">
    <!-- Header -->
    <div class="page-header">
      <a-button text @click="handleBack">
        <template #icon>
          <a-icon><ArrowLeft /></a-icon>
        </template>
        返回
      </a-button>
      <div class="header-center">
        <h2>{{ doc?.name || '流程文档详情' }}</h2>
        <a-tag
          v-if="doc"
          :type="doc.status === 'Active' ? 'success' : 'info'"
          size="small"
        >
          {{ doc.status === 'Active' ? '启用' : '停用' }}
        </a-tag>
      </div>
      <a-button type="primary" @click="handleEdit">
        编辑
      </a-button>
    </div>

    <a-card v-if="doc" v-loading="loading">
      <a-descriptions :column="2" border>
        <a-descriptions-item label="文档名称" :span="2">
          {{ doc.name }}
        </a-descriptions-item>
        <a-descriptions-item label="所属分类">
          {{ doc.category?.name || '-' }}
        </a-descriptions-item>
        <a-descriptions-item label="版本">
          {{ doc.version }}
        </a-descriptions-item>
        <a-descriptions-item label="负责角色" :span="2">
          {{ doc.responsibleRole || '-' }}
        </a-descriptions-item>
        <a-descriptions-item label="适用范围" :span="2">
          {{ formatJsonText(doc.applicableScope) }}
        </a-descriptions-item>
      </a-descriptions>

      <!-- Sections -->
      <div class="detail-section">
        <h3 class="section-title">
          触发条件
        </h3>
        <div class="section-content">
          {{ formatJsonText(doc.triggerCondition) }}
        </div>
      </div>

      <div class="detail-section">
        <h3 class="section-title">
          输入材料
        </h3>
        <div class="section-content">
          {{ formatJsonText(doc.inputMaterials) }}
        </div>
      </div>

      <div class="detail-section">
        <h3 class="section-title">
          输出材料
        </h3>
        <div class="section-content">
          {{ formatJsonText(doc.outputMaterials) }}
        </div>
      </div>

      <div class="detail-section">
        <h3 class="section-title">
          流程步骤
        </h3>
        <div class="section-content" style="white-space: pre-wrap;">
          {{ formatJsonText(doc.steps) }}
        </div>
      </div>

      <a-descriptions :column="2" border class="related-section">
        <a-descriptions-item label="关联检查模板">
          {{ doc.relatedChecklist || '-' }}
        </a-descriptions-item>
        <a-descriptions-item label="关联模板">
          {{ doc.relatedTemplates || '-' }}
        </a-descriptions-item>
        <a-descriptions-item label="关联档案">
          {{ doc.relatedArchive || '-' }}
        </a-descriptions-item>
      </a-descriptions>

      <div class="detail-section">
        <h3 class="section-title">
          风险提示
        </h3>
        <div class="section-content">
          {{ formatJsonText(doc.riskNotes) }}
        </div>
      </div>
    </a-card>

    <a-dialog v-model="editVisible" title="编辑流程文档" width="720px">
      <a-form :model="editForm" label-width="100px">
        <a-form-item label="文档名称">
          <a-input v-model="editForm.name" />
        </a-form-item>
        <a-form-item label="负责角色">
          <a-select
            v-model="editForm.responsibleRole"
            filterable
            clearable
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
        <a-form-item label="适用范围">
          <a-input v-model="editForm.applicableScope" />
        </a-form-item>
        <a-form-item label="触发条件">
          <a-textarea v-model="editForm.triggerCondition" />
        </a-form-item>
        <a-form-item label="输入材料">
          <a-textarea v-model="editForm.inputMaterials" />
        </a-form-item>
        <a-form-item label="输出材料">
          <a-textarea v-model="editForm.outputMaterials" />
        </a-form-item>
        <a-form-item label="流程步骤">
          <a-textarea v-model="editForm.steps" :rows="6" />
        </a-form-item>
        <a-form-item label="风险提示">
          <a-textarea v-model="editForm.riskNotes" />
        </a-form-item>
        <a-form-item label="状态">
          <a-segmented
            v-model="editForm.status"
            :options="[
              { label: '启用', value: 'Active' },
              { label: '停用', value: 'Inactive' },
            ]"
          />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button type="primary" @click="handleSave">
          保存
        </a-button>
      </template>
    </a-dialog>
  </div>
</template>

<style scoped lang="scss">
.workflow-detail-page {
  min-width: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 12px;

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
}

.detail-section {
  margin-top: 24px;
  padding: 16px;
  background: var(--app-surface-subtle);
  border-radius: 6px;
}

.section-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--app-border);
}

.section-content {
  font-size: 14px;
  color: var(--app-text-muted);
  line-height: 1.6;
}

.related-section {
  margin-top: 24px;
}
</style>
