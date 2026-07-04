<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { checklistApi } from '@/api/checklist'
import { roleApi } from '@/api/role'
import type {
  ChecklistTemplate,
  ChecklistTemplateItem,
  CreateChecklistTemplateItemParams,
  UpdateChecklistTemplateItemParams,
} from '@/types/checklist'
import type { TagType } from '@/types/ui'
import type { Role } from '@/types/role'

const route = useRoute()
const router = useRouter()
const templateId = route.params.id as string

const loading = ref(false)
const template = ref<ChecklistTemplate | null>(null)
const roles = ref<Role[]>([])

const dialogVisible = ref(false)
const isEdit = ref(false)
const currentItemId = ref('')
interface ChecklistItemForm {
  itemName?: string
  itemDescription?: string
  checkStandard?: string
  evidenceRequired?: string
  evidenceTypes?: string[]
  minEvidenceCount?: number
  allowAlbum?: boolean
  requireLocation?: boolean
  riskLevel?: string
  isRequired?: boolean
  responsibleRole?: string
  reviewRole?: string
  sortOrder?: number
}

const formData = ref<ChecklistItemForm>({
  itemName: '',
})

const fetchTemplate = async () => {
  loading.value = true
  try {
    template.value = await checklistApi.getTemplateById(templateId)
  } catch {
    Message.error('获取模板详情失败')
  } finally {
    loading.value = false
  }
}

const handleAddItem = () => {
  isEdit.value = false
  currentItemId.value = ''
  formData.value = {
    itemName: '',
    evidenceTypes: ['photo', 'file'],
    minEvidenceCount: 1,
    allowAlbum: true,
    requireLocation: false,
  }
  dialogVisible.value = true
}

const handleEditItem = (item: ChecklistTemplateItem) => {
  isEdit.value = true
  currentItemId.value = item.id
  formData.value = {
    itemName: item.itemName,
    itemDescription: item.itemDescription,
    checkStandard: item.checkStandard,
    evidenceRequired: item.evidenceRequired,
    evidenceTypes: item.evidenceTypes?.split(',') ?? ['photo', 'file'],
    minEvidenceCount: item.minEvidenceCount,
    allowAlbum: item.allowAlbum,
    requireLocation: item.requireLocation,
    isRequired: item.isRequired,
    riskLevel: item.riskLevel,
    responsibleRole: item.responsibleRole,
    reviewRole: item.reviewRole,
    sortOrder: item.sortOrder,
  }
  dialogVisible.value = true
}

const handleDeleteItem = async (item: ChecklistTemplateItem) => {
  try {
    await arcoConfirm(`确定删除检查项 "${item.itemName}" 吗？`, '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await checklistApi.deleteItem(item.id)
    Message.success('删除成功')
    fetchTemplate()
  } catch {
    // cancelled
  }
}

const handleSubmit = async () => {
  try {
    if (isEdit.value && currentItemId.value) {
      await checklistApi.updateItem(currentItemId.value, formData.value as UpdateChecklistTemplateItemParams)
      Message.success('更新成功')
    } else {
      await checklistApi.addItem(templateId, formData.value as CreateChecklistTemplateItemParams)
      Message.success('添加成功')
    }
    dialogVisible.value = false
    fetchTemplate()
  } catch {
    Message.error('操作失败')
  }
}

const handleBack = () => {
  router.push({ path: '/checklist' })
}

const riskLevelType = (level: string): TagType => {
  switch (level) {
    case 'Critical': return 'danger'
    case 'High': return 'warning'
    case 'Medium': return 'warning'
    default: return 'info'
  }
}

onMounted(async () => {
  roles.value = await roleApi.getList()
  await fetchTemplate()
})
</script>

<template>
  <div class="template-detail-page">
    <!-- Header -->
    <div class="page-header">
      <a-button text @click="handleBack">
        <template #icon>
          <a-icon><ArrowLeft /></a-icon>
        </template>
        返回
      </a-button>
      <div class="header-info">
        <h2>{{ template?.templateName || '模板详情' }}</h2>
        <span class="header-meta">
          编码: {{ template?.templateCode }} | 版本: {{ template?.version }}
        </span>
      </div>
      <a-button type="primary" @click="handleAddItem">
        添加检查项
      </a-button>
    </div>

    <a-card v-loading="loading">
      <a-table
        :data="template?.items || []"
        border
        stripe
        style="width: 100%"
      >
        <a-table-column type="index" label="#" :width="50" />
        <a-table-column prop="itemName" label="检查项名称" :min-width="200" />
        <a-table-column
          prop="checkStandard"
          label="检查标题"
          :min-width="200"
          show-overflow-tooltip
        />
        <a-table-column prop="riskLevel" label="风险等级" :width="100">
          <template #default="{ row }">
            <a-tag :type="riskLevelType(row.riskLevel)" size="small">
              {{ row.riskLevel }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column
          prop="isRequired"
          label="必填"
          :width="70"
          align="center"
        >
          <template #default="{ row }">
            <a-icon v-if="row.isRequired" color="#67C23A">
              <Check />
            </a-icon>
            <a-icon v-else color="#C0C4CC">
              <Close />
            </a-icon>
          </template>
        </a-table-column>
        <a-table-column label="证据要求" :width="120">
          <template #default="{ row }">
            {{ row.minEvidenceCount }} 份 / {{ row.requireLocation ? '需定位' : '不需定位' }}
          </template>
        </a-table-column>
        <a-table-column prop="responsibleRole" label="负责角色" :width="120" />
        <a-table-column prop="reviewRole" label="审核角色" :width="120" />
        <a-table-column
          prop="sortOrder"
          label="排序"
          :width="70"
          align="center"
        />
        <a-table-column label="操作" :width="160" fixed="right">
          <template #default="{ row }">
            <a-button
              type="primary"
              text
              size="small"
              @click="handleEditItem(row)"
            >
              编辑
            </a-button>
            <a-button
              status="danger" type="secondary"
              text
              size="small"
              @click="handleDeleteItem(row)"
            >
              删除
            </a-button>
          </template>
        </a-table-column>
      </a-table>

      <div v-if="(!template?.items || template.items.length === 0) && !loading" class="empty-state">
        暂无检查项，请点击"添加检查项"按钮创建
      </div>
    </a-card>

    <!-- Add/Edit Item Dialog -->
    <a-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑检查项' : '添加检查项'"
      width="600px"
      :close-on-click-modal="false"
    >
      <a-form
        ref="formRef"
        :model="formData"
        label-width="120px"
      >
        <a-form-item label="检查项名称" prop="itemName">
          <a-input v-model="formData.itemName" :maxlength="200" />
        </a-form-item>
        <a-form-item label="检查项描述">
          <a-textarea
            v-model="formData.itemDescription"

            :rows="2"
            :maxlength="500"
            show-word-limit
          />
        </a-form-item>
        <a-form-item label="检查标题">
          <a-textarea
            v-model="formData.checkStandard"

            :rows="3"
          />
        </a-form-item>
        <a-form-item label="所需证据">
          <a-textarea
            v-model="formData.evidenceRequired"

            :rows="2"
          />
        </a-form-item>
        <a-form-item label="证据类型">
          <a-checkbox-group v-model="formData.evidenceTypes">
            <a-checkbox label="photo">
              现场照片
            </a-checkbox>
            <a-checkbox label="file">
              记录文件
            </a-checkbox>
          </a-checkbox-group>
        </a-form-item>
        <a-form-item label="最少数量">
          <a-input-number v-model="formData.minEvidenceCount" :min="0" :max="20" />
        </a-form-item>
        <a-form-item label="相册选择">
          <a-switch v-model="formData.allowAlbum" />
        </a-form-item>
        <a-form-item label="要求定位">
          <a-switch v-model="formData.requireLocation" />
        </a-form-item>
        <a-form-item label="风险等级">
          <a-select v-model="formData.riskLevel" style="width: 200px">
            <a-option label="低风险" value="Low" />
            <a-option label="中风险" value="Medium" />
            <a-option label="高风险" value="High" />
            <a-option label="严重风险" value="Critical" />
          </a-select>
        </a-form-item>
        <a-form-item label="是否必填">
          <a-switch v-model="formData.isRequired" />
        </a-form-item>
        <a-form-item label="负责角色">
          <a-select
            v-model="formData.responsibleRole"
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
        <a-form-item label="审核角色">
          <a-select
            v-model="formData.reviewRole"
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
        <a-form-item label="排序号">
          <a-input-number v-model="formData.sortOrder" :min="0" />
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

<style scoped lang="scss">
.template-detail-page {
  min-width: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.header-info {
  display: flex;
  flex-direction: column;
  align-items: center;

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
}

.header-meta {
  font-size: 12px;
  color: var(--app-text-muted);
  margin-top: 4px;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--app-text-muted);
  font-size: 14px;
}
</style>
