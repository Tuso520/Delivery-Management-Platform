<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { departmentApi } from '@/api/platform'
import { userApi } from '@/api/user'
import type { DepartmentNode } from '@/types/platform'
import type { UserListItem } from '@/types/user'

const loading = ref(false)
const departments = ref<DepartmentNode[]>([])
const users = ref<UserListItem[]>([])
const dialogVisible = ref(false)
const editingId = ref('')
const form = ref({
  departmentCode: '',
  departmentName: '',
  parentId: '',
  managerId: '',
  sortOrder: 0,
})

function flatten(nodes: DepartmentNode[]): DepartmentNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)])
}

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [tree, userPage] = await Promise.all([
      departmentApi.getTree(),
      userApi.getList({ page: 1, pageSize: 100, status: 'Active' }),
    ])
    departments.value = tree
    users.value = userPage.list
  } finally {
    loading.value = false
  }
}

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
  const payload = {
    ...form.value,
    parentId: form.value.parentId || undefined,
    managerId: form.value.managerId || undefined,
  }
  if (editingId.value) {
    await departmentApi.update(editingId.value, payload)
  } else {
    await departmentApi.create(payload)
  }
  Message.success('组织信息已保存')
  dialogVisible.value = false
  await fetchData()
}

onMounted(fetchData)
</script>

<template>
  <section class="resource-page">
    <div class="page-toolbar">
      <div><h2>组织架构</h2><p>维护部门层级、负责人及在岗人数</p></div>
      <a-button type="primary" @click="openCreate()">
        新建部门
      </a-button>
    </div>
    <a-table
      v-loading="loading"
      :data="departments"
      row-key="id"
      border
      default-expand-all
      :tree-props="{ children: 'children' }"
    >
      <a-table-column prop="departmentName" label="閮ㄩ棬" :min-width="220" />
      <a-table-column prop="departmentCode" label="编码" :width="180" />
      <a-table-column prop="manager.realName" label="负责人" :width="120" />
      <a-table-column prop="userCount" label="人数" :width="80" />
      <a-table-column prop="status" label="状态" :width="90" />
      <a-table-column label="操作" :width="170">
        <template #default="{ row }">
          <a-button text type="primary" @click="openCreate(row.id)">
            新增下级
          </a-button>
          <a-button text @click="openEdit(row)">
            编辑
          </a-button>
        </template>
      </a-table-column>
    </a-table>

    <a-dialog v-model="dialogVisible" :title="editingId ? '编辑部门' : '新建部门'" width="560px">
      <a-form :model="form" label-width="90px">
        <a-form-item label="部门编码" required>
          <a-input v-model="form.departmentCode" :disabled="Boolean(editingId)" />
        </a-form-item>
        <a-form-item label="部门名称" required>
          <a-input v-model="form.departmentName" />
        </a-form-item>
        <a-form-item label="涓婄骇閮ㄩ棬">
          <a-select v-model="form.parentId" clearable style="width:100%">
            <a-option
              v-for="item in flatten(departments)"
              :key="item.id"
              :label="item.departmentName"
              :value="item.id"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="负责人">
          <a-select
            v-model="form.managerId"
            filterable
            clearable
            style="width:100%"
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
        <a-button type="primary" @click="save">
          保存
        </a-button>
      </template>
    </a-dialog>
  </section>
</template>
