<script setup lang="ts">
import { computed, reactive, ref, shallowRef } from 'vue'
import Message from '@arco-design/web-vue/es/message'
import type { FormInstance, TableColumnData } from '@arco-design/web-vue'
import { IconPlus } from '@arco-design/web-vue/es/icon'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { roleApi } from '@/api/role'
import { permissionApi } from '@/api/permission'
import {
  BusinessModal,
  BusinessTable,
  PageContainer,
  PageToolbar,
  StatusBadge,
} from '@/design-system'
import { Can } from '@/platform/permission'
import { useRolesQuery } from '@/composables/queries/useAdministrationQueries'
import { queryKeys } from '@/query/keys'
import type {
  AssignPermissionsDto,
  CreateRoleDto,
  Permission,
  PermissionModule,
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
const isEditingProtectedRole = computed(() =>
  roleList.value.some((role) => role.id === currentId.value && role.isProtected),
)
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
const selectedPermIds = ref<string[]>([])
const permissionModules = shallowRef<PermissionModule[]>([])
const permTreeLoading = ref(false)
const permLoadFailed = ref(false)
let permissionSession = 0
const actionGroups = [
  { key: 'VIEW', label: '查看' },
  { key: 'OPERATE', label: '操作 / 编辑' },
  { key: 'TRANSFER', label: '上传 / 下载' },
  { key: 'DELETE', label: '删除' },
] as const
type ActionGroup = (typeof actionGroups)[number]['key']
const permissionColumnWidths: Record<ActionGroup, number> = {
  VIEW: 64,
  OPERATE: 96,
  TRANSFER: 96,
  DELETE: 64,
}
const permissionModalBodyStyle = {
  display: 'flex',
  height: 'min(720px, calc(100vh - 144px))',
  flexDirection: 'column',
  overflowY: 'hidden',
} as const
const permissionMatrixColumns: TableColumnData[] = [
  {
    title: '页面 / 功能',
    minWidth: 220,
    slotName: 'permissionLabel',
  },
  ...actionGroups.map(({ key, label }) => ({
    title: label,
    width: permissionColumnWidths[key],
    align: 'center' as const,
    titleSlotName: `permissionTitle-${key}`,
    slotName: `permissionCell-${key}`,
  })),
]
interface PermissionMatrixRow {
  id: string
  label: string
  level: 'module' | 'page' | 'permission'
  permissions: Permission[]
  children?: PermissionMatrixRow[]
}
const matrixRows = computed<PermissionMatrixRow[]>(() =>
  permissionModules.value.map((module) => {
    const pages = module.pages.map((page) => ({
      id: `page:${module.moduleCode}:${page.pageCode}`,
      label: page.pageName,
      level: 'page' as const,
      permissions: page.permissions,
      children: page.permissions.map((permission) => ({
        id: `permission:${permission.id}`,
        label: permission.permissionName,
        level: 'permission' as const,
        permissions: [permission],
      })),
    }))
    return {
      id: `module:${module.moduleCode}`,
      label: module.moduleName,
      level: 'module' as const,
      permissions: pages.flatMap((page) => page.permissions),
      children: pages,
    }
  }),
)
const allPermissions = computed(() =>
  permissionModules.value.flatMap((module) => module.pages.flatMap((page) => page.permissions)),
)
const canAssignSystemAdministratorPermissions = computed(
  () => currentRoleForPerm.value?.roleCode === 'SYSTEM_ADMIN',
)

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
    await queryClient.invalidateQueries({ queryKey: queryKeys.roles.list() })
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

async function openAssignPermissions(row: Role): Promise<void> {
  const previousRoleId = currentRoleForPerm.value?.id
  const session = ++permissionSession
  if (previousRoleId) {
    await queryClient.cancelQueries({ queryKey: queryKeys.roles.detail(previousRoleId) })
  }
  currentRoleForPerm.value = row
  selectedPermIds.value = []
  permissionModules.value = []
  permLoadFailed.value = false
  permTreeLoading.value = true
  permDialogVisible.value = true

  try {
    const [modules, detail] = await Promise.all([
      queryClient.fetchQuery({
        queryKey: queryKeys.permissions.groups(),
        queryFn: permissionApi.getAll,
        staleTime: 0,
      }),
      queryClient.fetchQuery({
        queryKey: queryKeys.roles.detail(row.id),
        queryFn: ({ signal }) => roleApi.getById(row.id, signal),
        staleTime: 0,
      }),
    ])
    if (session !== permissionSession || currentRoleForPerm.value?.id !== row.id) return
    permissionModules.value = modules
    selectedPermIds.value = selectablePermissions(detail.permissions).map(
      (permission: Permission) => permission.id,
    )
  } catch {
    if (session === permissionSession) permLoadFailed.value = true
  } finally {
    if (session === permissionSession) permTreeLoading.value = false
  }
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
    closePermissionDialog()
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

function retryPermissionData(): void {
  if (currentRoleForPerm.value) void openAssignPermissions(currentRoleForPerm.value)
}

function closePermissionDialog(): void {
  const roleId = currentRoleForPerm.value?.id
  permissionSession += 1
  permDialogVisible.value = false
  permTreeLoading.value = false
  if (roleId) void queryClient.cancelQueries({ queryKey: queryKeys.roles.detail(roleId) })
}

function setPermissions(permissions: readonly Permission[], checked: boolean): void {
  const assignable = selectablePermissions(permissions)
  const permissionIds = new Set(assignable.map((permission) => permission.id))
  if (checked) {
    selectedPermIds.value = [
      ...new Set([...selectedPermIds.value, ...assignable.map((permission) => permission.id)]),
    ]
    return
  }
  selectedPermIds.value = selectedPermIds.value.filter((id: string) => !permissionIds.has(id))
}

function selectablePermissions(permissions: readonly Permission[]): Permission[] {
  if (canAssignSystemAdministratorPermissions.value) return [...permissions]
  return permissions.filter((permission) => !permission.restrictedToSystemAdministrator)
}

function isPermissionSelectionDisabled(permissions: readonly Permission[]): boolean {
  return (
    Boolean(currentRoleForPerm.value?.isProtected) ||
    selectablePermissions(permissions).length === 0
  )
}

function isAllChecked(permissions: readonly Permission[]): boolean {
  const assignable = selectablePermissions(permissions)
  return (
    assignable.length > 0 &&
    assignable.every((permission: Permission) => selectedPermIds.value.includes(permission.id))
  )
}

function isIndeterminate(permissions: readonly Permission[]): boolean {
  const assignable = selectablePermissions(permissions)
  const checkedCount = assignable.filter((permission: Permission) =>
    selectedPermIds.value.includes(permission.id),
  ).length
  return checkedCount > 0 && checkedCount < assignable.length
}

function actionPermissions(row: PermissionMatrixRow, actionGroup: ActionGroup): Permission[] {
  return row.permissions.filter((permission) => permission.actionGroup === actionGroup)
}

function allActionPermissions(actionGroup: ActionGroup): Permission[] {
  return allPermissions.value.filter((permission) => permission.actionGroup === actionGroup)
}
</script>

<template>
  <PageContainer class="role-page">
    <PageToolbar
      title="角色权限"
      description="按页面与功能维护角色，并为用户中心的角色分配提供授权依据"
    >
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
                  {{ row.isProtected ? '查看权限' : '配置权限' }}
                </a-button>
              </Can>
              <Can permission="role:delete">
                <a-button
                  status="danger"
                  type="text"
                  size="small"
                  :disabled="row.isProtected"
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
          <a-radio-group v-model="formData.status" :disabled="isEditingProtectedRole">
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
      title="配置角色权限"
      width="min(1080px, calc(100vw - 32px))"
      :body-style="permissionModalBodyStyle"
      :mask-closable="false"
      @cancel="closePermissionDialog"
    >
      <div v-if="currentRoleForPerm" class="perm-dialog-info">
        为角色<strong>{{ currentRoleForPerm.roleName }}({{ currentRoleForPerm.roleCode }})</strong>
        配置权限。新建角色默认不包含任何权限。
      </div>

      <a-alert v-if="currentRoleForPerm?.isProtected" type="info" class="protected-alert">
        超级管理员固定拥有全部权限，不能取消、停用或删除。
      </a-alert>

      <div class="permission-batch-actions">
        <a-space>
          <a-button
            size="small"
            :disabled="currentRoleForPerm?.isProtected"
            @click="setPermissions(allPermissions, true)"
          >
            全部勾选
          </a-button>
          <a-button
            size="small"
            :disabled="currentRoleForPerm?.isProtected"
            @click="setPermissions(allPermissions, false)"
          >
            全部取消
          </a-button>
        </a-space>
      </div>

      <div class="perm-tree-container">
        <div v-if="permTreeLoading" class="permission-loading">
          <a-spin tip="正在加载权限" />
        </div>
        <a-result
          v-else-if="permLoadFailed"
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
        <div v-else-if="permissionModules.length === 0" class="perm-empty">
          暂无可用权限数据
        </div>
        <BusinessTable
          v-else-if="permissionModules.length"
          :data="matrixRows"
          :columns="permissionMatrixColumns"
          row-key="id"
          default-expand-all-rows
          bordered
          fit-container
          class="permission-matrix"
        >
          <template #permissionLabel="{ record: row }">
            <a-checkbox
              :model-value="isAllChecked(row.permissions)"
              :indeterminate="isIndeterminate(row.permissions)"
              :disabled="isPermissionSelectionDisabled(row.permissions)"
              @change="(value) => setPermissions(row.permissions, Boolean(value))"
            >
              <span :class="`permission-label permission-label--${row.level}`">{{
                row.label
              }}</span>
            </a-checkbox>
          </template>
          <template
            v-for="actionGroup in actionGroups"
            #[`permissionTitle-${actionGroup.key}`]
            :key="`title-${actionGroup.key}`"
          >
            <a-checkbox
              :model-value="isAllChecked(allActionPermissions(actionGroup.key))"
              :indeterminate="isIndeterminate(allActionPermissions(actionGroup.key))"
              :disabled="isPermissionSelectionDisabled(allActionPermissions(actionGroup.key))"
              @change="
                (value) => setPermissions(allActionPermissions(actionGroup.key), Boolean(value))
              "
            >
              {{ actionGroup.label }}
            </a-checkbox>
          </template>
          <template
            v-for="actionGroup in actionGroups"
            #[`permissionCell-${actionGroup.key}`]="{ record: row }"
            :key="`cell-${actionGroup.key}`"
          >
            <a-checkbox
              v-if="actionPermissions(row, actionGroup.key).length"
              :model-value="isAllChecked(actionPermissions(row, actionGroup.key))"
              :indeterminate="isIndeterminate(actionPermissions(row, actionGroup.key))"
              :disabled="isPermissionSelectionDisabled(actionPermissions(row, actionGroup.key))"
              @change="
                (value) => setPermissions(actionPermissions(row, actionGroup.key), Boolean(value))
              "
            />
            <span v-else class="permission-empty">-</span>
          </template>
        </BusinessTable>
      </div>

      <template #footer>
        <a-button @click="closePermissionDialog">
          取消
        </a-button>
        <a-button
          type="primary"
          :loading="roleMutation.isPending.value"
          :disabled="permLoadFailed || currentRoleForPerm?.isProtected"
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

.protected-alert,
.permission-batch-actions {
  margin-bottom: 12px;
}

.permission-batch-actions {
  display: flex;
  justify-content: flex-end;
}

.perm-tree-container {
  display: flex;
  min-height: 0;
  flex: 1;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  overflow: visible;
  padding: 6px;
}

.perm-tree-container :deep(.business-table) {
  min-height: 0;
  flex: 1;
}

.perm-tree-container :deep(.business-table__viewport) {
  max-height: none;
}

.permission-matrix :deep(.arco-table-th:nth-child(n + 2) .arco-table-cell),
.permission-matrix :deep(.arco-table-td:nth-child(n + 2) .arco-table-cell) {
  padding-right: 6px;
  padding-left: 6px;
}

.permission-matrix :deep(.arco-table-th:nth-child(n + 2) .arco-checkbox) {
  justify-content: center;
  line-height: 18px;
  white-space: normal;
}

.perm-empty {
  padding: 32px 0;
  color: #86909c;
  font-size: 14px;
  text-align: center;
}

.permission-loading {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.permission-label--module {
  font-weight: 600;
}

.permission-label--page {
  font-weight: 500;
}

.permission-empty {
  color: #9aa49f;
}
</style>
