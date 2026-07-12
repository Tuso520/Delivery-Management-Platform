<script setup lang="ts">
import { computed, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { departmentApi } from '@/api/platform'
import {
  BusinessModal,
  BusinessTable,
  Can,
  PageContainer,
  PageToolbar,
  StatusBadge,
} from '@/components/business'
import { useDepartmentsQuery, useUsersQuery } from '@/composables/queries/useAdministrationQueries'
import { queryKeys } from '@/query/keys'
import type { DepartmentNode } from '@/types/platform'
import type { QueryUserParams, UserListItem } from '@/types/user'

interface DepartmentForm {
  departmentCode: string
  departmentName: string
  parentId: string
  managerId: string
  sortOrder: number
}

interface DepartmentMutationVariables {
  id?: string
  data: Record<string, unknown>
}

const queryClient = useQueryClient()
const departmentsQuery = useDepartmentsQuery()
const activeUserParams: QueryUserParams = { page: 1, pageSize: 100, status: 'Active' }
const activeUsersQuery = useUsersQuery(activeUserParams)
const departments = computed<DepartmentNode[]>(() => departmentsQuery.data.value ?? [])
const users = computed<UserListItem[]>(() => activeUsersQuery.data.value?.items ?? [])

const dialogVisible = ref(false)
const editingId = ref('')
const form = ref<DepartmentForm>({
  departmentCode: '',
  departmentName: '',
  parentId: '',
  managerId: '',
  sortOrder: 0,
})

function flatten(nodes: DepartmentNode[]): DepartmentNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)])
}

const parentOptions = computed(() =>
  flatten(departments.value).filter((department) => department.id !== editingId.value),
)

const departmentMutation = useMutation({
  mutationFn: (variables: DepartmentMutationVariables) =>
    variables.id
      ? departmentApi.update(variables.id, variables.data)
      : departmentApi.create(variables.data),
  retry: false,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.departments.all })
  },
})

function openCreate(parentId = ''): void {
  editingId.value = ''
  form.value = {
    departmentCode: '',
    departmentName: '',
    parentId,
    managerId: '',
    sortOrder: 0,
  }
  dialogVisible.value = true
}

function openEdit(row: DepartmentNode): void {
  editingId.value = row.id
  form.value = {
    departmentCode: row.departmentCode,
    departmentName: row.departmentName,
    parentId: row.parentId ?? '',
    managerId: row.managerId ?? '',
    sortOrder: row.sortOrder,
  }
  dialogVisible.value = true
}

async function save(): Promise<void> {
  const departmentCode = form.value.departmentCode.trim()
  const departmentName = form.value.departmentName.trim()
  if (!departmentCode || !departmentName) {
    Message.warning('请填写部门编码和部门名称')
    return
  }

  try {
    await departmentMutation.mutateAsync({
      id: editingId.value || undefined,
      data: {
        ...form.value,
        departmentCode,
        departmentName,
        parentId: form.value.parentId || undefined,
        managerId: form.value.managerId || undefined,
      },
    })
    Message.success('组织信息已保存')
    dialogVisible.value = false
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

function retryData(): void {
  void Promise.all([departmentsQuery.refetch(), activeUsersQuery.refetch()])
}
</script>

<template>
  <PageContainer class="resource-page department-page">
    <PageToolbar title="组织架构" description="维护部门层级、负责人及在岗人数">
      <template #actions>
        <Can permission="department:manage">
          <a-button type="primary" @click="openCreate()">
            新建部门
          </a-button>
        </Can>
      </template>
    </PageToolbar>

    <BusinessTable
      :data="departments"
      :loading="departmentsQuery.isFetching.value"
      :error="departmentsQuery.isError.value ? '组织架构加载失败' : null"
      empty-title="暂无部门"
      empty-description="可通过右上角创建部门"
      retry-label="重试"
      row-key="id"
      bordered
      default-expand-all-rows
      @retry="retryData"
    >
      <a-table-column data-index="departmentName" title="部门" :min-width="220" />
      <a-table-column data-index="departmentCode" title="编码" :width="180" />
      <a-table-column data-index="manager.realName" title="负责人" :width="120" />
      <a-table-column data-index="userCount" title="人数" :width="80" />
      <a-table-column data-index="status" title="状态" :width="90">
        <template #cell="{ record: row }">
          <StatusBadge
            domain="department"
            :status="row.status"
            :label="row.status === 'Active' ? '启用' : '停用'"
          />
        </template>
      </a-table-column>
      <a-table-column title="操作" :width="170">
        <template #cell="{ record: row }">
          <Can permission="department:manage">
            <a-space size="mini" :wrap="false">
              <a-button type="text" @click="openCreate(row.id)">
                新增下级
              </a-button>
              <a-button type="text" @click="openEdit(row)">
                编辑
              </a-button>
            </a-space>
          </Can>
        </template>
      </a-table-column>
    </BusinessTable>

    <BusinessModal
      v-model:visible="dialogVisible"
      :title="editingId ? '编辑部门' : '新建部门'"
      :width="560"
      :mask-closable="false"
    >
      <a-alert v-if="activeUsersQuery.isError.value" type="warning" class="manager-alert">
        负责人列表加载失败，仍可保存其他部门信息。
        <template #action>
          <a-button size="small" @click="retryData">
            重试
          </a-button>
        </template>
      </a-alert>
      <a-form :model="form" auto-label-width>
        <a-form-item label="部门编码" required>
          <a-input v-model="form.departmentCode" :disabled="Boolean(editingId)" />
        </a-form-item>
        <a-form-item label="部门名称" required>
          <a-input v-model="form.departmentName" />
        </a-form-item>
        <a-form-item label="上级部门">
          <a-select v-model="form.parentId" allow-clear style="width: 100%">
            <a-option
              v-for="item in parentOptions"
              :key="item.id"
              :label="item.departmentName"
              :value="item.id"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="负责人">
          <a-select
            v-model="form.managerId"
            :loading="activeUsersQuery.isFetching.value"
            allow-search
            allow-clear
            style="width: 100%"
          >
            <a-option
              v-for="user in users"
              :key="user.id"
              :label="user.realName"
              :value="user.id"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="排序">
          <a-input-number v-model="form.sortOrder" :min="0" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="dialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" :loading="departmentMutation.isPending.value" @click="save">
          保存
        </a-button>
      </template>
    </BusinessModal>
  </PageContainer>
</template>

<style scoped lang="scss">
.manager-alert {
  margin-bottom: 12px;
}
</style>
