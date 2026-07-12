<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import type { FormInstance } from '@arco-design/web-vue'
import { IconPlus } from '@arco-design/web-vue/es/icon'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { roleApi } from '@/api/role'
import {
  BusinessModal,
  BusinessTable,
  Can,
  PageContainer,
  PageToolbar,
  StatusBadge,
} from '@/components/business'
import {
  usePermissionGroupsQuery,
  useRoleDetailQuery,
  useRolesQuery,
} from '@/composables/queries/useAdministrationQueries'
import { queryKeys } from '@/query/keys'
import type {
  AssignPermissionsDto,
  CreateRoleDto,
  Permission,
  PermissionGroup,
  Role,
  UpdateRoleDto,
} from '@/types/role'
import { arcoConfirm } from '@/utils/arco-dialog'

type RoleMutationVariables =
  | { kind: 'create'; data: CreateRoleDto }
  | { kind: 'update'; id: string; data: UpdateRoleDto }
  | { kind: 'delete'; id: string }
  | { kind: 'assignPermissions'; id: string; data: AssignPermissionsDto }

const queryClient = useQueryClient()
const roleListQuery = useRolesQuery()
const roleList = computed<Role[]>(() => roleListQuery.data.value ?? [])

const dialogVisible = ref(false)
const isEdit = ref(false)
const currentId = ref('')
const formRef = ref<FormInstance>()
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

const permDialogVisible = ref(false)
const currentRoleForPerm = ref<Role | null>(null)
const currentRoleId = computed(() => currentRoleForPerm.value?.id ?? '')
const selectedPermIds = ref<string[]>([])
const permissionGroupsQuery = usePermissionGroupsQuery(permDialogVisible)
const roleDetailQuery = useRoleDetailQuery(currentRoleId, permDialogVisible)
const permissionGroups = computed<PermissionGroup[]>(() => permissionGroupsQuery.data.value ?? [])
const permTreeLoading = computed(
  () => permissionGroupsQuery.isFetching.value || roleDetailQuery.isFetching.value,
)
const permLoadFailed = computed(
  () => permissionGroupsQuery.isError.value || roleDetailQuery.isError.value,
)
const actionGroups = [
  { key: 'view', label: '查看' },
  { key: 'download', label: '下载' },
  { key: 'upload', label: '上传' },
  { key: 'operate', label: '操作' },
] as const

const roleMutation = useMutation({
  mutationFn: async (variables: RoleMutationVariables): Promise<void> => {
    switch (variables.kind) {
      case 'create':
        await roleApi.create(variables.data)
        return
      case 'update':
        await roleApi.update(variables.id, variables.data)
        return
      case 'delete':
        await roleApi.delete(variables.id)
        return
      case 'assignPermissions':
        await roleApi.assignPermissions(variables.id, variables.data)
        return
    }
  },
  retry: false,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.roles.all })
  },
})

function openCreate(): void {
  isEdit.value = false
  currentId.value = ''
  Object.assign(formData, {
    roleCode: '',
    roleName: '',
    description: '',
    status: 'Active',
  })
  dialogVisible.value = true
}

function openEdit(row: Role): void {
  isEdit.value = true
  currentId.value = row.id
  Object.assign(formData, {
    roleCode: row.roleCode,
    roleName: row.roleName,
    description: row.description ?? '',
    status: row.status,
  })
  dialogVisible.value = true
}

async function handleSubmit(): Promise<void> {
  const errors = await formRef.value?.validate()
  if (errors) return

  try {
    if (isEdit.value) {
      await roleMutation.mutateAsync({
        kind: 'update',
        id: currentId.value,
        data: {
          roleName: formData.roleName,
          description: formData.description || undefined,
          status: formData.status,
        },
      })
      Message.success('更新成功')
    } else {
      await roleMutation.mutateAsync({
        kind: 'create',
        data: {
          roleCode: formData.roleCode,
          roleName: formData.roleName,
          description: formData.description || undefined,
        },
      })
      Message.success('创建成功')
    }
    dialogVisible.value = false
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

function handleDelete(row: Role): void {
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
        await roleMutation.mutateAsync({ kind: 'delete', id: row.id })
        Message.success('删除成功')
      } catch {
        // The shared request layer has already surfaced the failure.
      }
    })
    .catch(() => undefined)
}

function openAssignPermissions(row: Role): void {
  currentRoleForPerm.value = row
  selectedPermIds.value = []
  permDialogVisible.value = true
}

async function handleAssignPermissions(): Promise<void> {
  if (!currentRoleForPerm.value) return
  try {
    await roleMutation.mutateAsync({
      kind: 'assignPermissions',
      id: currentRoleForPerm.value.id,
      data: { permissionIds: selectedPermIds.value },
    })
    Message.success('权限分配成功')
    permDialogVisible.value = false
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

function retryPermissionData(): void {
  void Promise.all([permissionGroupsQuery.refetch(), roleDetailQuery.refetch()])
}

function handleGroupCheckAll(group: PermissionGroup, checked: boolean): void {
  if (checked) {
    const newIds = group.permissions
      .filter((permission: Permission) => !selectedPermIds.value.includes(permission.id))
      .map((permission: Permission) => permission.id)
    selectedPermIds.value.push(...newIds)
    return
  }
  const groupIds = new Set(group.permissions.map((permission: Permission) => permission.id))
  selectedPermIds.value = selectedPermIds.value.filter((id: string) => !groupIds.has(id))
}

function isGroupAllChecked(group: PermissionGroup): boolean {
  return group.permissions.every((permission: Permission) =>
    selectedPermIds.value.includes(permission.id),
  )
}

function isGroupIndeterminate(group: PermissionGroup): boolean {
  const groupCheckedCount = group.permissions.filter((permission: Permission) =>
    selectedPermIds.value.includes(permission.id),
  ).length
  return groupCheckedCount > 0 && groupCheckedCount < group.permissions.length
}

function permissionsByAction(
  group: PermissionGroup,
  actionGroup: 'view' | 'download' | 'upload' | 'operate',
): Permission[] {
  return group.permissions.filter((permission) => permission.actionGroup === actionGroup)
}

function resourceLabel(resource: string): string {
  const map: Record<string, string> = {
    user: '用户管理',
    role: '角色管理',
    permission: '权限管理',
    project: '项目管理',
    archive: '档案管理',
    file: '文件管理',
    file_review: '文件审核',
    archive_template: '档案模版',
    standard: '标准库',
    knowledge: '知识库',
    tools: '工具管理',
    currency: '币种配置',
    settings: '设置入口',
    notification_rule: '通知规则',
    approval_config: '审批配置',
    audit_log: '操作日志',
    system_setting: '系统配置',
    dashboard: '数据看板',
    payment: '项目回款',
    department: '组织架构',
    dictionary: '数据字典',
    integration: '接口集成',
  }
  return map[resource] || resource
}

watch(
  [() => permDialogVisible.value, () => roleDetailQuery.data.value],
  ([visible, detail]) => {
    if (visible && detail?.id === currentRoleId.value) {
      selectedPermIds.value = detail.permissions.map((permission: Permission) => permission.id)
    }
  },
  { immediate: true },
)
</script>

<template>
  <PageContainer class="role-page">
    <PageToolbar title="角色管理" description="维护角色定义及权限矩阵">
      <template #actions>
        <Can permission="role:create">
          <a-button type="primary" @click="openCreate">
            <template #icon>
              <IconPlus />
            </template>
            创建角色
          </a-button>
        </Can>
      </template>
    </PageToolbar>

    <a-card class="table-card">
      <BusinessTable
        :data="roleList"
        :loading="roleListQuery.isFetching.value"
        :error="roleListQuery.isError.value ? '角色列表加载失败' : null"
        empty-title="暂无角色"
        empty-description="可通过右上角创建角色"
        retry-label="重试"
        bordered
        stripe
        @retry="roleListQuery.refetch()"
      >
        <a-table-column data-index="roleCode" title="角色编码" :width="160" />
        <a-table-column data-index="roleName" title="角色名称" :min-width="160" />
        <a-table-column
          data-index="description"
          title="描述"
          :min-width="240"
          tooltip
        />
        <a-table-column
          data-index="userCount"
          title="用户数"
          :width="80"
          align="center"
        />
        <a-table-column
          data-index="permissionCount"
          title="权限数"
          :width="80"
          align="center"
        />
        <a-table-column data-index="status" title="状态" :width="90">
          <template #cell="{ record: row }">
            <StatusBadge
              domain="role"
              :status="row.status"
              :label="row.status === 'Active' ? '活跃' : '禁用'"
            />
          </template>
        </a-table-column>
        <a-table-column title="操作" :width="200" fixed="right">
          <template #cell="{ record: row }">
            <a-space size="mini" :wrap="false">
              <Can permission="role:update">
                <a-button type="text" size="small" @click="openEdit(row)">
                  编辑
                </a-button>
              </Can>
              <Can permission="role:assign_permission">
                <a-button type="text" size="small" @click="openAssignPermissions(row)">
                  权限
                </a-button>
              </Can>
              <Can permission="role:delete">
                <a-button
                  status="danger"
                  type="text"
                  size="small"
                  @click="handleDelete(row)"
                >
                  删除
                </a-button>
              </Can>
            </a-space>
          </template>
        </a-table-column>
      </BusinessTable>
    </a-card>

    <BusinessModal
      v-model:visible="dialogVisible"
      :title="isEdit ? '编辑角色' : '创建角色'"
      :width="520"
      :mask-closable="false"
    >
      <a-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        auto-label-width
      >
        <a-form-item label="角色编码" field="roleCode">
          <a-input
            v-model="formData.roleCode"
            :disabled="isEdit"
            :max-length="50"
            placeholder="例如: PROJECT_MANAGER"
          />
        </a-form-item>
        <a-form-item label="角色名称" field="roleName">
          <a-input v-model="formData.roleName" :max-length="50" placeholder="例如: 项目经理" />
        </a-form-item>
        <a-form-item label="描述" field="description">
          <a-textarea
            v-model="formData.description"
            :auto-size="{ minRows: 3, maxRows: 3 }"
            :max-length="200"
            placeholder="角色描述（选填）"
          />
        </a-form-item>
        <a-form-item v-if="isEdit" label="状态" field="status">
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
        <a-button type="primary" :loading="roleMutation.isPending.value" @click="handleSubmit">
          保存
        </a-button>
      </template>
    </BusinessModal>

    <BusinessModal
      v-model:visible="permDialogVisible"
      title="分配权限"
      :width="1080"
      :mask-closable="false"
    >
      <div v-if="currentRoleForPerm" class="perm-dialog-info">
        为角色<strong>{{ currentRoleForPerm.roleName }}({{ currentRoleForPerm.roleCode }})</strong>
        分配权限
      </div>

      <a-spin :loading="permTreeLoading" class="perm-tree-container">
        <a-result
          v-if="permLoadFailed"
          status="error"
          title="权限数据加载失败"
          subtitle="请重试后再保存"
        >
          <template #extra>
            <a-button @click="retryPermissionData">
              重试
            </a-button>
          </template>
        </a-result>
        <div v-else-if="permissionGroups.length === 0 && !permTreeLoading" class="perm-empty">
          暂无可用权限数据
        </div>
        <BusinessTable
          v-else-if="permissionGroups.length"
          :data="permissionGroups"
          bordered
          class="permission-matrix"
        >
          <a-table-column title="模块" :width="160" fixed="left">
            <template #cell="{ record: row }">
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
            :title="actionGroup.label"
            :min-width="205"
          >
            <template #cell="{ record: row }">
              <a-checkbox-group v-model="selectedPermIds" class="matrix-cell">
                <a-checkbox
                  v-for="permission in permissionsByAction(row, actionGroup.key)"
                  :key="permission.id"
                  :value="permission.id"
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
        </BusinessTable>
      </a-spin>

      <template #footer>
        <a-button @click="permDialogVisible = false">
          取消
        </a-button>
        <a-button
          type="primary"
          :loading="roleMutation.isPending.value"
          :disabled="permLoadFailed"
          @click="handleAssignPermissions"
        >
          保存
        </a-button>
      </template>
    </BusinessModal>
  </PageContainer>
</template>

<style scoped lang="scss">
.perm-dialog-info {
  margin-bottom: 16px;
  color: #4e5969;
  font-size: 14px;
}

.perm-tree-container {
  max-height: 580px;
  overflow-y: auto;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  padding: 12px;
}

.perm-empty {
  padding: 32px 0;
  color: #86909c;
  font-size: 14px;
  text-align: center;
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
