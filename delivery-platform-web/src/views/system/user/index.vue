<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import type { FormInstance } from '@arco-design/web-vue'
import { IconPlus } from '@arco-design/web-vue/es/icon'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { userApi } from '@/api/user'
import {
  BusinessModal,
  BusinessTable,
  Can,
  PageContainer,
  PageToolbar,
  StatusBadge,
} from '@/components/business'
import {
  useDepartmentsQuery,
  useRolesQuery,
  useUsersQuery,
} from '@/composables/queries/useAdministrationQueries'
import { queryKeys } from '@/query/keys'
import type { DepartmentNode } from '@/types/platform'
import type {
  AssignRolesDto,
  CreateUserDto,
  QueryUserParams,
  ResetPasswordDto,
  UpdateUserDto,
  UserListItem,
  UserRoleItem,
} from '@/types/user'
import { arcoConfirm } from '@/utils/arco-dialog'
import {
  getUserStatusLabel as statusLabel,
  passwordFormRules as pwdFormRules,
  validateArcoForm,
  type UserFormModel,
} from './form-config'
import UserFormDialog from './UserFormDialog.vue'

type UserMutationVariables =
  | { kind: 'create'; data: CreateUserDto }
  | { kind: 'update'; id: string; data: UpdateUserDto }
  | { kind: 'delete' | 'disable' | 'enable'; id: string }
  | { kind: 'assignRoles'; id: string; data: AssignRolesDto }
  | { kind: 'resetPassword'; id: string; data: ResetPasswordDto }

const queryClient = useQueryClient()
const filters = reactive({ keyword: '', status: '', departmentId: '' })
const queryParams = reactive<QueryUserParams>({
  page: 1,
  pageSize: 20,
  keyword: '',
  status: '',
  departmentId: '',
})
const userListQuery = useUsersQuery(() => ({ ...queryParams }))
const departmentsQuery = useDepartmentsQuery()

const dialogVisible = ref(false)
const isEdit = ref(false)
const currentId = ref('')
const formData = reactive<UserFormModel>({
  username: '',
  password: '',
  realName: '',
  email: '',
  phone: '',
  departmentId: '',
})

const roleDialogVisible = ref(false)
const currentUserForRole = ref<UserListItem | null>(null)
const selectedRoleIds = ref<string[]>([])
const rolesQuery = useRolesQuery(roleDialogVisible)

const pwdDialogVisible = ref(false)
const currentUserForPwd = ref('')
const pwdFormData = reactive({ newPassword: '' })
const pwdFormRef = ref<FormInstance>()

const userList = computed<UserListItem[]>(() => userListQuery.data.value?.items ?? [])
const total = computed(() => userListQuery.data.value?.total ?? 0)
const departmentTree = computed<DepartmentNode[]>(() => departmentsQuery.data.value ?? [])
const roleList = computed(() => rolesQuery.data.value ?? [])
const pagination = computed(() => ({
  page: queryParams.page ?? 1,
  pageSize: queryParams.pageSize ?? 20,
  total: total.value,
}))
const departmentNames = computed(() => {
  const result = new Map<string, string>()
  const collect = (nodes: DepartmentNode[]): void => {
    nodes.forEach((node) => {
      result.set(node.id, node.departmentName)
      collect(node.children)
    })
  }
  collect(departmentTree.value)
  return result
})

const userMutation = useMutation({
  mutationFn: async (variables: UserMutationVariables): Promise<void> => {
    switch (variables.kind) {
      case 'create':
        await userApi.create(variables.data)
        return
      case 'update':
        await userApi.update(variables.id, variables.data)
        return
      case 'delete':
        await userApi.delete(variables.id)
        return
      case 'disable':
        await userApi.disable(variables.id)
        return
      case 'enable':
        await userApi.enable(variables.id)
        return
      case 'assignRoles':
        await userApi.assignRoles(variables.id, variables.data)
        return
      case 'resetPassword':
        await userApi.resetPassword(variables.id, variables.data)
        return
    }
  },
  retry: false,
  onSuccess: async (_, variables) => {
    const invalidations = [queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })]
    if (variables.kind === 'assignRoles' || variables.kind === 'delete') {
      invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.roles.list() }))
    }
    await Promise.all(invalidations)
  },
})

function handleSearch(): void {
  queryParams.keyword = filters.keyword.trim()
  queryParams.status = filters.status
  queryParams.departmentId = filters.departmentId
  queryParams.page = 1
}

function handleReset(): void {
  filters.keyword = ''
  filters.status = ''
  filters.departmentId = ''
  handleSearch()
}

function handlePageChange(page: number): void {
  queryParams.page = page
}

function handleSizeChange(pageSize: number): void {
  queryParams.pageSize = pageSize
  queryParams.page = 1
}

function openCreate(): void {
  isEdit.value = false
  currentId.value = ''
  Object.assign(formData, {
    username: '',
    password: '',
    realName: '',
    email: '',
    phone: '',
    departmentId: '',
  })
  dialogVisible.value = true
}

function openEdit(row: UserListItem): void {
  isEdit.value = true
  currentId.value = row.id
  Object.assign(formData, {
    username: row.username,
    password: '',
    realName: row.realName,
    email: row.email ?? '',
    phone: row.phone ?? '',
    departmentId: row.departmentId ?? '',
  })
  dialogVisible.value = true
}

async function handleSubmit(): Promise<void> {
  const data: UpdateUserDto = {
    realName: formData.realName,
    email: formData.email || undefined,
    phone: formData.phone || undefined,
    departmentId: formData.departmentId || undefined,
  }
  try {
    if (isEdit.value) {
      await userMutation.mutateAsync({ kind: 'update', id: currentId.value, data })
      Message.success('更新成功')
    } else {
      await userMutation.mutateAsync({
        kind: 'create',
        data: {
          username: formData.username,
          password: formData.password,
          realName: formData.realName,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          departmentId: formData.departmentId || undefined,
        },
      })
      Message.success('创建成功')
    }
    dialogVisible.value = false
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

function handleDelete(row: UserListItem): void {
  arcoConfirm(
    `确定删除用户“${row.realName}(${row.username})”吗？删除后该用户将被禁用且不可恢复。`,
    '确认删除',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    },
  )
    .then(async () => {
      try {
        await userMutation.mutateAsync({ kind: 'delete', id: row.id })
        Message.success('删除成功')
      } catch {
        // The shared request layer has already surfaced the failure.
      }
    })
    .catch(() => undefined)
}

function handleDisable(row: UserListItem): void {
  arcoConfirm(`确定禁用用户 "${row.realName}(${row.username})" 吗？`, '确认禁用', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      try {
        await userMutation.mutateAsync({ kind: 'disable', id: row.id })
        Message.success('禁用成功')
      } catch {
        // The shared request layer has already surfaced the failure.
      }
    })
    .catch(() => undefined)
}

function handleEnable(row: UserListItem): void {
  arcoConfirm(`确定启用用户 "${row.realName}(${row.username})" 吗？`, '确认启用', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'info',
  })
    .then(async () => {
      try {
        await userMutation.mutateAsync({ kind: 'enable', id: row.id })
        Message.success('启用成功')
      } catch {
        // The shared request layer has already surfaced the failure.
      }
    })
    .catch(() => undefined)
}

function openAssignRoles(row: UserListItem): void {
  currentUserForRole.value = row
  selectedRoleIds.value = row.roles.map((role: UserRoleItem) => role.id)
  roleDialogVisible.value = true
}

async function handleAssignRoles(): Promise<void> {
  if (!currentUserForRole.value) return
  try {
    await userMutation.mutateAsync({
      kind: 'assignRoles',
      id: currentUserForRole.value.id,
      data: { roleIds: selectedRoleIds.value },
    })
    Message.success('角色分配成功')
    roleDialogVisible.value = false
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

function openResetPassword(row: UserListItem): void {
  currentUserForPwd.value = row.id
  pwdFormData.newPassword = ''
  pwdDialogVisible.value = true
}

async function handleResetPassword(): Promise<void> {
  if (!(await validateArcoForm(pwdFormRef.value))) return
  try {
    await userMutation.mutateAsync({
      kind: 'resetPassword',
      id: currentUserForPwd.value,
      data: { newPassword: pwdFormData.newPassword },
    })
    Message.success('密码重置成功')
    pwdDialogVisible.value = false
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}
</script>

<template>
  <PageContainer class="user-page">
    <PageToolbar title="用户管理" description="维护用户资料、状态及角色授权">
      <template #actions>
        <Can permission="user:create">
          <a-button type="primary" @click="openCreate">
            <template #icon>
              <IconPlus />
            </template>
            创建用户
          </a-button>
        </Can>
      </template>
    </PageToolbar>

    <a-card class="search-card">
      <a-form :model="filters" layout="inline">
        <a-form-item label="关键词">
          <a-input
            v-model="filters.keyword"
            placeholder="用户名/真实姓名/邮箱"
            allow-clear
            style="width: 220px"
            @press-enter="handleSearch"
          />
        </a-form-item>
        <a-form-item label="状态">
          <a-select
            v-model="filters.status"
            placeholder="全部"
            allow-clear
            style="width: 120px"
          >
            <a-option label="活跃" value="Active" />
            <a-option label="禁用" value="Inactive" />
            <a-option label="锁定" value="Locked" />
          </a-select>
        </a-form-item>
        <a-form-item label="部门">
          <a-tree-select
            v-model="filters.departmentId"
            :data="departmentTree"
            :field-names="{ key: 'id', title: 'departmentName', children: 'children' }"
            :loading="departmentsQuery.isFetching.value"
            allow-clear
            tree-check-strictly
            allow-search
            style="width: 180px"
          />
        </a-form-item>
        <a-form-item>
          <a-space>
            <a-button type="primary" @click="handleSearch">
              查询
            </a-button>
            <a-button @click="handleReset">
              重置
            </a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </a-card>

    <a-card class="table-card">
      <BusinessTable
        :data="userList"
        :loading="userListQuery.isFetching.value"
        :error="userListQuery.isError.value ? '用户列表加载失败' : null"
        empty-title="暂无用户"
        empty-description="可通过右上角创建用户"
        retry-label="重试"
        :pagination="pagination"
        bordered
        stripe
        @retry="userListQuery.refetch()"
        @page-change="handlePageChange"
        @page-size-change="handleSizeChange"
      >
        <a-table-column data-index="username" title="用户名" :width="140" />
        <a-table-column data-index="realName" title="真实姓名" :width="120" />
        <a-table-column
          data-index="email"
          title="邮箱"
          :min-width="180"
          tooltip
        />
        <a-table-column data-index="phone" title="手机号" :width="140" />
        <a-table-column title="部门" :width="140">
          <template #cell="{ record: row }">
            {{ row.departmentId ? departmentNames.get(row.departmentId) : '未分配' }}
          </template>
        </a-table-column>
        <a-table-column title="角色" :width="180">
          <template #cell="{ record: row }">
            <template v-if="row.roles.length > 0">
              <a-tag
                v-for="role in row.roles"
                :key="role.id"
                size="small"
                color="blue"
                style="margin-right: 4px; margin-bottom: 2px"
              >
                {{ role.roleName }}
              </a-tag>
            </template>
            <span v-else class="no-role">未分配</span>
          </template>
        </a-table-column>
        <a-table-column data-index="status" title="状态" :width="90">
          <template #cell="{ record: row }">
            <StatusBadge domain="user" :status="row.status" :label="statusLabel(row.status)" />
          </template>
        </a-table-column>
        <a-table-column data-index="lastLoginAt" title="最后登录" :width="170">
          <template #cell="{ record: row }">
            {{ row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString('zh-CN') : '-' }}
          </template>
        </a-table-column>
        <a-table-column title="操作" :width="300" fixed="right">
          <template #cell="{ record: row }">
            <a-space size="mini" :wrap="false">
              <Can permission="user:update">
                <a-button type="text" size="small" @click="openEdit(row)">
                  编辑
                </a-button>
              </Can>
              <Can permission="user:assign_role">
                <a-button type="text" size="small" @click="openAssignRoles(row)">
                  角色
                </a-button>
              </Can>
              <Can permission="user:reset_password">
                <a-button type="text" size="small" @click="openResetPassword(row)">
                  重置密码
                </a-button>
              </Can>
              <Can permission="user:disable">
                <a-button
                  v-if="row.status === 'Active'"
                  status="warning"
                  type="text"
                  size="small"
                  @click="handleDisable(row)"
                >
                  禁用
                </a-button>
                <a-button
                  v-else-if="row.status === 'Inactive'"
                  status="success"
                  type="text"
                  size="small"
                  @click="handleEnable(row)"
                >
                  启用
                </a-button>
              </Can>
              <Can permission="user:delete">
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

    <UserFormDialog
      v-model:visible="dialogVisible"
      v-model:form-data="formData"
      :is-edit="isEdit"
      :loading="userMutation.isPending.value"
      :departments="departmentTree"
      @submit="handleSubmit"
    />

    <BusinessModal
      v-model:visible="roleDialogVisible"
      title="分配角色"
      :width="500"
      :mask-closable="false"
    >
      <div v-if="currentUserForRole" class="role-dialog-info">
        为用户
        <strong>{{ currentUserForRole.realName }}({{ currentUserForRole.username }})</strong>
        分配角色
      </div>
      <a-spin :loading="rolesQuery.isFetching.value">
        <a-alert v-if="rolesQuery.isError.value" type="error">
          角色列表加载失败，请重试。
        </a-alert>
        <a-checkbox-group v-else v-model="selectedRoleIds" class="role-checkbox-group">
          <a-checkbox v-for="role in roleList" :key="role.id" :value="role.id">
            {{ role.roleName }}
            <span class="role-code-hint">({{ role.roleCode }})</span>
          </a-checkbox>
        </a-checkbox-group>
      </a-spin>
      <template #footer>
        <a-button @click="roleDialogVisible = false">
          取消
        </a-button>
        <a-button
          type="primary"
          :loading="userMutation.isPending.value"
          :disabled="rolesQuery.isError.value"
          @click="handleAssignRoles"
        >
          保存
        </a-button>
      </template>
    </BusinessModal>

    <BusinessModal
      v-model:visible="pwdDialogVisible"
      title="重置密码"
      :width="420"
      :mask-closable="false"
    >
      <a-form
        ref="pwdFormRef"
        :model="pwdFormData"
        :rules="pwdFormRules"
        auto-label-width
      >
        <a-form-item label="新密码" field="newPassword">
          <a-input
            v-model="pwdFormData.newPassword"
            type="password"
            :max-length="100"
            placeholder="请输入新密码"
          />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="pwdDialogVisible = false">
          取消
        </a-button>
        <a-button
          type="primary"
          :loading="userMutation.isPending.value"
          @click="handleResetPassword"
        >
          确定
        </a-button>
      </template>
    </BusinessModal>
  </PageContainer>
</template>

<style scoped lang="scss" src="./index.scss"></style>
