<script setup lang="ts">
import { computed, ref, reactive, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { departmentApi } from '@/api/platform'
import { userApi } from '@/api/user'
import type { DepartmentNode } from '@/types/platform'
import type { UserListItem, UserRoleItem, QueryUserParams } from '@/types/user'
import {
  getUserStatusLabel as statusLabel,
  getUserStatusTagType as statusTagType,
  passwordFormRules as pwdFormRules,
  type UserFormModel,
} from './form-config'
import UserFormDialog from './UserFormDialog.vue'
const loading = ref(false)
const userList = ref<UserListItem[]>([])
const departmentTree = ref<DepartmentNode[]>([])
const total = ref(0)
const queryParams = reactive<QueryUserParams>({
  page: 1,
  pageSize: 20,
  keyword: '',
  status: '',
})
const actionLoading = ref(false)
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
const roleList = ref<Array<{ id: string; roleCode: string; roleName: string }>>([])
const selectedRoleIds = ref<string[]>([])
const roleLoading = ref(false)
const pwdDialogVisible = ref(false)
const currentUserForPwd = ref<string>('')
const pwdFormData = reactive({ newPassword: '' })
const pwdFormRef = ref()
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
const fetchList = async () => {
  loading.value = true
  try {
    const res = await userApi.getList(queryParams)
    userList.value = res.list
    total.value = res.pagination.total
  } catch {
    userList.value = []
  } finally {
    loading.value = false
  }
}
const handleSearch = () => {
  queryParams.page = 1
  fetchList()
}
const handleReset = () => {
  queryParams.keyword = ''
  queryParams.status = ''
  queryParams.departmentId = ''
  queryParams.page = 1
  fetchList()
}
const handlePageChange = (page: number) => {
  queryParams.page = page
  fetchList()
}
const handleSizeChange = (size: number) => {
  queryParams.pageSize = size
  queryParams.page = 1
  fetchList()
}
const openCreate = () => {
  isEdit.value = false
  currentId.value = ''
  formData.username = ''
  formData.password = ''
  formData.realName = ''
  formData.email = ''
  formData.phone = ''
  formData.departmentId = ''
  dialogVisible.value = true
}
const openEdit = (row: UserListItem) => {
  isEdit.value = true
  currentId.value = row.id
  formData.username = row.username
  formData.password = ''
  formData.realName = row.realName
  formData.email = row.email ?? ''
  formData.phone = row.phone ?? ''
  formData.departmentId = row.departmentId ?? ''
  dialogVisible.value = true
}
const handleSubmit = async () => {
  actionLoading.value = true
  try {
    const payload = {
      realName: formData.realName,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      departmentId: formData.departmentId || undefined,
    }
    if (isEdit.value) {
      await userApi.update(currentId.value, payload)
      Message.success('更新成功')
    } else {
      await userApi.create({
        username: formData.username,
        password: formData.password,
        ...payload,
      })
      Message.success('创建成功')
    }
    dialogVisible.value = false
    fetchList()
  } catch { return } finally {
    actionLoading.value = false
  }
}
const handleDelete = (row: UserListItem) => {
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
        await userApi.delete(row.id)
        Message.success('删除成功')
        fetchList()
      } catch { return }
    })
    .catch(() => {
    })
}
const handleDisable = (row: UserListItem) => {
  arcoConfirm(
    `确定禁用用户 "${row.realName}(${row.username})" 吗？`,
    '确认禁用',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    },
  )
    .then(async () => {
      try {
        await userApi.disable(row.id)
        Message.success('禁用成功')
        fetchList()
      } catch { return }
    })
    .catch(() => {
    })
}
const handleEnable = (row: UserListItem) => {
  arcoConfirm(
    `确定启用用户 "${row.realName}(${row.username})" 吗？`,
    '确认启用',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info',
    },
  )
    .then(async () => {
      try {
        await userApi.enable(row.id)
        Message.success('启用成功')
        fetchList()
      } catch { return }
    })
    .catch(() => {
    })
}
const openAssignRoles = async (row: UserListItem) => {
  currentUserForRole.value = row
  selectedRoleIds.value = row.roles.map((r: UserRoleItem) => r.id)
  roleLoading.value = true
  try {
    const roles = await userApi.getAllRoles()
    roleList.value = roles
  } catch {
    roleList.value = []
  } finally {
    roleLoading.value = false
  }
  roleDialogVisible.value = true
}
const handleAssignRoles = async () => {
  if (!currentUserForRole.value) return
  actionLoading.value = true
  try {
    await userApi.assignRoles(currentUserForRole.value.id, { roleIds: selectedRoleIds.value })
    Message.success('角色分配成功')
    roleDialogVisible.value = false
    fetchList()
  } catch { return } finally {
    actionLoading.value = false
  }
}
const openResetPassword = (row: UserListItem) => {
  currentUserForPwd.value = row.id
  pwdFormData.newPassword = ''
  pwdDialogVisible.value = true
}
const handleResetPassword = async () => {
  const valid = await pwdFormRef.value.validate().catch(() => false)
  if (!valid) return
  actionLoading.value = true
  try {
    await userApi.resetPassword(currentUserForPwd.value, { newPassword: pwdFormData.newPassword })
    Message.success('密码重置成功')
    pwdDialogVisible.value = false
  } catch { return } finally {
    actionLoading.value = false
  }
}
onMounted(async () => {
  departmentTree.value = await departmentApi.getTree()
  await fetchList()
})
</script>
<template>
  <div class="user-page">
    <a-card class="search-card">
      <a-form :model="queryParams" inline>
        <a-form-item label="关键词">
          <a-input
            v-model="queryParams.keyword"
            placeholder="用户名/真实姓名/邮箱"
            clearable
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </a-form-item>
        <a-form-item label="状态">
          <a-select
            v-model="queryParams.status"
            placeholder="全部"
            clearable
            style="width: 120px"
            @change="handleSearch"
          >
            <a-option label="活跃" value="Active" />
            <a-option label="禁用" value="Inactive" />
            <a-option label="锁定" value="Locked" />
          </a-select>
        </a-form-item>
        <a-form-item label="閮ㄩ棬">
          <a-tree-select
            v-model="queryParams.departmentId"
            :data="departmentTree"
            node-key="id"
            :props="{ label: 'departmentName', children: 'children' }"
            clearable
            check-strictly
            filterable
            style="width: 180px"
            @change="handleSearch"
          />
        </a-form-item>
        <a-form-item>
          <a-button type="primary" @click="handleSearch">
            查询
          </a-button>
          <a-button @click="handleReset">
            重置
          </a-button>
        </a-form-item>
      </a-form>
    </a-card>
    <a-card class="table-card">
      <div class="table-header">
        <span class="table-title">用户列表</span>
        <a-button type="primary" @click="openCreate">
          <a-icon><Plus /></a-icon> 创建用户
        </a-button>
      </div>
      <a-table
        v-loading="loading"
        :data="userList"
        border
        stripe
        style="width: 100%"
      >
        <a-table-column prop="username" label="用户名" :width="140" />
        <a-table-column prop="realName" label="真实姓名" :width="120" />
        <a-table-column
          prop="email"
          label="邮箱"
          :min-width="180"
          show-overflow-tooltip
        />
        <a-table-column prop="phone" label="手机号" :width="140" />
        <a-table-column label="閮ㄩ棬" :width="140">
          <template #default="{ row }">
            {{ row.departmentId ? departmentNames.get(row.departmentId) : '未分配 '}}
          </template>
        </a-table-column>
        <a-table-column label="角色" :width="180">
          <template #default="{ row }">
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
        <a-table-column prop="status" label="状态" :width="90">
          <template #default="{ row }">
            <a-tag :type="statusTagType(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column prop="lastLoginAt" label="最后登录" :width="170">
          <template #default="{ row }">
            <span>{{ row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString('zh-CN') : '-' }}</span>
          </template>
        </a-table-column>
        <a-table-column label="操作" :width="280" fixed="right">
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
              @click="openAssignRoles(row)"
            >
              角色
            </a-button>
            <a-button
              type="primary"
              text
              size="small"
              @click="openResetPassword(row)"
            >
              重置密码
            </a-button>
            <a-button
              v-if="row.status === 'Active'"
              status="warning" type="secondary"
              text
              size="small"
              @click="handleDisable(row)"
            >
              禁用
            </a-button>
            <a-button
              v-if="row.status === 'Inactive'"
              status="success" type="secondary"
              text
              size="small"
              @click="handleEnable(row)"
            >
              启用
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
          v-model:current-page="queryParams.page!"
          v-model:page-size="queryParams.pageSize!"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </a-card>
    <UserFormDialog
      v-model:visible="dialogVisible"
      v-model:form-data="formData"
      :is-edit="isEdit"
      :loading="actionLoading"
      :departments="departmentTree"
      @submit="handleSubmit"
    />
    <a-dialog
      v-model="roleDialogVisible"
      title="分配角色"
      width="500px"
      :close-on-click-modal="false"
    >
      <div v-if="currentUserForRole" class="role-dialog-info">
        为用户 <strong>{{ currentUserForRole.realName }}({{ currentUserForRole.username }})</strong> 分配角色
      </div>
      <a-checkbox-group v-model="selectedRoleIds" v-loading="roleLoading" class="role-checkbox-group">
        <a-checkbox
          v-for="role in roleList"
          :key="role.id"
          :label="role.id"
          :value="role.id"
          border
        >
          {{ role.roleName }}
          <span class="role-code-hint">({{ role.roleCode }})</span>
        </a-checkbox>
      </a-checkbox-group>
      <template #footer>
        <a-button @click="roleDialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" :loading="actionLoading" @click="handleAssignRoles">
          保存
        </a-button>
      </template>
    </a-dialog>
    <a-dialog
      v-model="pwdDialogVisible"
      title="重置密码"
      width="420px"
      :close-on-click-modal="false"
    >
      <a-form
        ref="pwdFormRef"
        :model="pwdFormData"
        :rules="pwdFormRules"
        label-width="100px"
      >
        <a-form-item label="新密码" prop="newPassword">
          <a-input
            v-model="pwdFormData.newPassword"
            type="password"
            show-password
            :maxlength="255"
            placeholder="请输入新密码"
          />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="pwdDialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" :loading="actionLoading" @click="handleResetPassword">
          确定
        </a-button>
      </template>
    </a-dialog>
  </div>
</template>
<style scoped lang="scss" src="./index.scss"></style>
