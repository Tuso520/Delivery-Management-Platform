<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { roleApi } from '@/api/role'
import { permissionApi } from '@/api/permission'
import type { Role, PermissionGroup, Permission } from '@/types/role'
import type { TagType } from '@/types/ui'

const loading = ref(false)
const roleList = ref<Role[]>([])
const actionLoading = ref(false)

// Create/Edit dialog
const dialogVisible = ref(false)
const isEdit = ref(false)
const currentId = ref('')
const formRef = ref()
const formData = reactive({
  roleCode: '',
  roleName: '',
  description: '',
  status: 'Active',
})
const formRules = {
  roleCode: [
    { required: true, message: '请输入角色编码', trigger: 'blur' },
    { max: 50, message: '角色编码最多 50 个字符', trigger: 'blur' },
  ],
  roleName: [
    { required: true, message: '请输入角色名称', trigger: 'blur' },
    { max: 50, message: '角色名称最多 50 个字符', trigger: 'blur' },
  ],
}

// Assign permissions dialog
const permDialogVisible = ref(false)
const currentRoleForPerm = ref<Role | null>(null)
const permissionGroups = ref<PermissionGroup[]>([])
const selectedPermIds = ref<string[]>([])
const permLoading = ref(false)
const permTreeLoading = ref(false)
const actionGroups = [
  { key: 'view', label: '查看' },
  { key: 'download', label: '下载' },
  { key: 'upload', label: '上传' },
  { key: 'operate', label: '操作' },
] as const

const fetchList = async () => {
  loading.value = true
  try {
    const res = await roleApi.getList()
    roleList.value = res
  } catch {
    roleList.value = []
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  isEdit.value = false
  currentId.value = ''
  formData.roleCode = ''
  formData.roleName = ''
  formData.description = ''
  formData.status = 'Active'
  dialogVisible.value = true
}

const openEdit = (row: Role) => {
  isEdit.value = true
  currentId.value = row.id
  formData.roleCode = row.roleCode
  formData.roleName = row.roleName
  formData.description = row.description ?? ''
  formData.status = row.status
  dialogVisible.value = true
}

const handleSubmit = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  actionLoading.value = true
  try {
    if (isEdit.value) {
      await roleApi.update(currentId.value, {
        roleName: formData.roleName,
        description: formData.description || undefined,
        status: formData.status,
      })
      Message.success('更新成功')
    } else {
      await roleApi.create({
        roleCode: formData.roleCode,
        roleName: formData.roleName,
        description: formData.description || undefined,
      })
      Message.success('创建成功')
    }
    dialogVisible.value = false
    fetchList()
  } catch {
    // Error handled by interceptor
  } finally {
    actionLoading.value = false
  }
}

const handleDelete = (row: Role) => {
  arcoConfirm(
    `确定删除角色“${row.roleName}(${row.roleCode})”吗？\n该角色下还有 ${row.userCount} 个用户关联时无法删除。`,
    '确认删除',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    },
  )
    .then(async () => {
      try {
        await roleApi.delete(row.id)
        Message.success('删除成功')
        fetchList()
      } catch {
        // Error handled by interceptor
      }
    })
    .catch(() => {
      // cancelled
    })
}

const openAssignPermissions = async (row: Role) => {
  currentRoleForPerm.value = row
  selectedPermIds.value = []
  permDialogVisible.value = true
  permLoading.value = true
  permTreeLoading.value = true

  try {
    // Fetch permissions tree
    const groups = await permissionApi.getAll()
    permissionGroups.value = groups

    // Fetch role detail with current permissions
    const detail = await roleApi.getById(row.id)
    selectedPermIds.value = detail.permissions.map((p: Permission) => p.id)
  } catch {
    permissionGroups.value = []
    selectedPermIds.value = []
  } finally {
    permLoading.value = false
    permTreeLoading.value = false
  }
}

const handleAssignPermissions = async () => {
  if (!currentRoleForPerm.value) return
  actionLoading.value = true
  try {
    await roleApi.assignPermissions(currentRoleForPerm.value.id, { permissionIds: selectedPermIds.value })
    Message.success('权限分配成功')
    permDialogVisible.value = false
    fetchList()
  } catch {
    // Error handled by interceptor
  } finally {
    actionLoading.value = false
  }
}

const handleGroupCheckAll = (group: PermissionGroup, checked: boolean) => {
  if (checked) {
    const newIds = group.permissions
      .filter((p: Permission) => !selectedPermIds.value.includes(p.id))
      .map((p: Permission) => p.id)
    selectedPermIds.value.push(...newIds)
  } else {
    const groupIds = new Set(group.permissions.map((p: Permission) => p.id))
    selectedPermIds.value = selectedPermIds.value.filter((id: string) => !groupIds.has(id))
  }
}

const isGroupAllChecked = (group: PermissionGroup): boolean => {
  return group.permissions.every((p: Permission) => selectedPermIds.value.includes(p.id))
}

const isGroupIndeterminate = (group: PermissionGroup): boolean => {
  const groupCheckedCount = group.permissions.filter((p: Permission) =>
    selectedPermIds.value.includes(p.id),
  ).length
  return groupCheckedCount > 0 && groupCheckedCount < group.permissions.length
}

const permissionsByAction = (
  group: PermissionGroup,
  actionGroup: 'view' | 'download' | 'upload' | 'operate',
) => group.permissions.filter((permission) => permission.actionGroup === actionGroup)

const resourceLabel = (resource: string): string => {
  const map: Record<string, string> = {
    user: '用户管理',
    role: '角色管理',
    permission: '权限管理',
    project: '项目管理',
    archive: '档案管理',
    file: '文件管理',
    review: '审核管理',
    checklist: '检查模板',
    workflow: '工作流',
    template: '模板管理',
    knowledge: '知识库',
    tools: '工具管理',
    country: '国家配置',
    currency: '币种配置',
    language: '语言配置',
    notification: '通知管理',
    dashboard: '数据看板',
    system: '系统设置',
    operation_log: '操作日志',
    system_config: '系统配置',
    process_record: '项目过程记录',
    payment: '项目回款',
    attachment: '通用附件',
    report: '工时与周报',
    okr: '目标与绩效',
    skill: '技能评估',
    training: '培训记录',
    department: '组织架构',
    approval: '审批配置',
    dictionary: '数据字典',
    integration: '鎺ュ彛闆嗘垚',
  }
  return map[resource] || resource
}

const statusTagType = (status: string): TagType => {
  return status === 'Active' ? 'success' : 'info'
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="role-page">
    <!-- Table -->
    <a-card class="table-card">
      <div class="table-header">
        <span class="table-title">角色列表</span>
        <a-button type="primary" @click="openCreate">
          <a-icon><Plus /></a-icon> 创建角色
        </a-button>
      </div>

      <a-table
        v-loading="loading"
        :data="roleList"
        border
        stripe
        style="width: 100%"
      >
        <a-table-column prop="roleCode" label="角色编码" :width="160" />
        <a-table-column prop="roleName" label="角色名称" :min-width="160" />
        <a-table-column
          prop="description"
          label="描述"
          :min-width="240"
          show-overflow-tooltip
        />
        <a-table-column
          prop="userCount"
          label="用户数"
          :width="80"
          align="center"
        />
        <a-table-column
          prop="permissionCount"
          label="权限数"
          :width="80"
          align="center"
        />
        <a-table-column prop="status" label="状态" :width="90">
          <template #default="{ row }">
            <a-tag :type="statusTagType(row.status)" size="small">
              {{ row.status === 'Active' ? '活跃' : '禁用' }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column label="操作" :width="200" fixed="right">
          <template #default="{ row }">
            <a-button
              type="primary"
              text
              size="small"
              @click="openEdit(row)"
            >
              编辑
            </a-button>
            <a-button
              type="primary"
              text
              size="small"
              @click="openAssignPermissions(row)"
            >
              权限
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
    </a-card>

    <!-- Create/Edit Dialog -->
    <a-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑角色' : '创建角色'"
      width="520px"
      :close-on-click-modal="false"
    >
      <a-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="100px"
      >
        <a-form-item label="角色编码" prop="roleCode">
          <a-input
            v-model="formData.roleCode"
            :disabled="isEdit"
            :maxlength="50"
            placeholder="例如: PROJECT_MANAGER"
          />
        </a-form-item>
        <a-form-item label="角色名称" prop="roleName">
          <a-input v-model="formData.roleName" :maxlength="50" placeholder="例如: 项目经理" />
        </a-form-item>
        <a-form-item label="描述" prop="description">
          <a-textarea
            v-model="formData.description"

            :rows="3"
            :maxlength="200"
            placeholder="角色描述（选填）"
          />
        </a-form-item>
        <a-form-item v-if="isEdit" label="状态" prop="status">
          <a-radio-group v-model="formData.status">
            <a-radio value="Active">
              活跃
            </a-radio>
            <a-radio value="Inactive">
              禁用
            </a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>

      <template #footer>
        <a-button @click="dialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" :loading="actionLoading" @click="handleSubmit">
          保存
        </a-button>
      </template>
    </a-dialog>

    <!-- Assign Permissions Dialog -->
    <a-dialog
      v-model="permDialogVisible"
      title="分配权限"
      width="1080px"
      :close-on-click-modal="false"
    >
      <div v-if="currentRoleForPerm" class="perm-dialog-info">
        为角色<strong>{{ currentRoleForPerm.roleName }}({{ currentRoleForPerm.roleCode }})</strong> 分配权限
      </div>

      <div v-loading="permTreeLoading" class="perm-tree-container">
        <div v-if="permissionGroups.length === 0 && !permTreeLoading" class="perm-empty">
          暂无可用权限数据
        </div>

        <a-table
          v-if="permissionGroups.length"
          :data="permissionGroups"
          border
          class="permission-matrix"
        >
          <a-table-column label="模块" :width="160" fixed="right">
            <template #default="{ row }">
              <a-checkbox
                :model-value="isGroupAllChecked(row)"
                :indeterminate="isGroupIndeterminate(row)"
                @change="(value) => handleGroupCheckAll(row, Boolean(value))"
              >
                {{ resourceLabel(row.resource) }}
              </a-checkbox>
            </template>
          </a-table-column>
          <a-table-column
            v-for="actionGroup in actionGroups"
            :key="actionGroup.key"
            :label="actionGroup.label"
            :min-width="205"
          >
            <template #default="{ row }">
              <a-checkbox-group v-model="selectedPermIds" class="matrix-cell">
                <a-checkbox
                  v-for="permission in permissionsByAction(row, actionGroup.key)"
                  :key="permission.id"
                  :label="permission.id"
                  class="matrix-permission"
                >
                  {{ permission.permissionName }}
                </a-checkbox>
                <span
                  v-if="permissionsByAction(row, actionGroup.key).length === 0"
                  class="permission-empty"
                >
                  -
                </span>
              </a-checkbox-group>
            </template>
          </a-table-column>
        </a-table>
      </div>

      <template #footer>
        <a-button @click="permDialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" :loading="actionLoading" @click="handleAssignPermissions">
          保存
        </a-button>
      </template>
    </a-dialog>
  </div>
</template>

<style scoped lang="scss">
.perm-dialog-info {
  margin-bottom: 16px;
  font-size: 14px;
  color: #4e5969;
}

.perm-tree-container {
  max-height: 580px;
  overflow-y: auto;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  padding: 12px;
}

.perm-empty {
  text-align: center;
  color: #86909c;
  padding: 32px 0;
  font-size: 14px;
}

.matrix-cell {
  display: grid;
  gap: 5px;
}

.matrix-permission {
  height: auto;
  margin-right: 0;
  white-space: normal;
}

.permission-empty {
  color: #9aa49f;
}
</style>
