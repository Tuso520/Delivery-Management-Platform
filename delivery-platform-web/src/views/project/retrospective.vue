<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { projectApi } from '@/api/project'
import { dictionaryApi, retrospectiveApi } from '@/api/platform'
import { userApi } from '@/api/user'
import type { Project } from '@/types/project'
import type { DictionaryItem, ProjectRetrospective } from '@/types/platform'
import type { UserListItem } from '@/types/user'

const loading = ref(false)
const records = ref<ProjectRetrospective[]>([])
const projects = ref<Project[]>([])
const users = ref<UserListItem[]>([])
const dialogVisible = ref(false)
const editingId = ref('')
const actionVisible = ref(false)
const selected = ref<ProjectRetrospective>()
const form = ref({ projectId: '', summary: '', lessonsLearned: '', problemCategory: '', status: 'Draft' })
const action = ref({ title: '', ownerId: '', dueDate: '', status: 'Open', verificationNote: '' })
const categoryOptions = ref<DictionaryItem[]>([])

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [page, projectPage, userPage, categoryDictionary] = await Promise.all([
      retrospectiveApi.getList({ page: 1, pageSize: 100 }),
      projectApi.getList({ page: 1, pageSize: 100 }),
      userApi.getList({ page: 1, pageSize: 100, status: 'Active' }),
      dictionaryApi.getByCode('retrospective_category'),
    ])
    records.value = page.list
    projects.value = projectPage.list
    users.value = userPage.list
    categoryOptions.value = categoryDictionary.items
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (editingId.value) {
    await retrospectiveApi.update(editingId.value, form.value)
  } else {
    await retrospectiveApi.create(form.value)
  }
  Message.success(editingId.value ? '项目复盘已更新' : '项目复盘已创建')
  dialogVisible.value = false
  await fetchData()
}

function openEditor(row?: ProjectRetrospective): void {
  editingId.value = row?.id ?? ''
  form.value = row
    ? {
        projectId: row.projectId,
        summary: row.summary,
        lessonsLearned: row.lessonsLearned ?? '',
        problemCategory: row.problemCategory ?? '',
        status: row.status,
      }
    : {
        projectId: '',
        summary: '',
        lessonsLearned: '',
        problemCategory: categoryOptions.value[0]?.itemValue ?? '',
        status: 'Draft',
      }
  dialogVisible.value = true
}

function openAction(row: ProjectRetrospective): void {
  selected.value = row
  action.value = { title: '', ownerId: '', dueDate: '', status: 'Open', verificationNote: '' }
  actionVisible.value = true
}

async function saveAction(): Promise<void> {
  if (!selected.value) return
  await retrospectiveApi.addAction(selected.value.id, action.value)
  Message.success('整改任务已添加')
  actionVisible.value = false
  await fetchData()
}

async function closeAction(item: ProjectRetrospective['actions'][number]): Promise<void> {
  await retrospectiveApi.updateAction(item.id, {
    title: item.title,
    ownerId: item.owner.id,
    dueDate: item.dueDate,
    status: 'Closed',
    verificationNote: item.verificationNote || '整改完成并验证',
  })
  Message.success('整改任务已关闭')
  await fetchData()
}

onMounted(fetchData)
</script>

<template>
  <section class="resource-page">
    <div class="page-toolbar">
      <div><h2>项目复盘</h2><p>沉淀问题、经验与可验证的整改任务</p></div>
      <a-button type="primary" @click="openEditor()">
        新建复盘
      </a-button>
    </div>
    <a-table
      v-loading="loading"
      :data="records"
      border
      stripe
    >
      <a-table-column prop="project.projectCode" label="项目编号" :width="160" />
      <a-table-column prop="project.projectName" label="项目名称" :min-width="190" />
      <a-table-column prop="problemCategory" label="问题分类" :width="120" />
      <a-table-column
        prop="summary"
        label="复盘摘要"
        :min-width="240"
        show-overflow-tooltip
      />
      <a-table-column label="整改任务" :min-width="260">
        <template #default="{ row }">
          <div v-for="item in row.actions" :key="item.id" class="action-row">
            <span>{{ item.title }} / {{ item.owner.realName }}</span>
            <a-button
              v-if="item.status !== 'Closed'"
              text
              status="success" type="secondary"
              @click="closeAction(item)"
            >
              关闭验证
            </a-button>
            <a-tag v-else color="green">
              已关闭            </a-tag>
          </div>
        </template>
      </a-table-column>
      <a-table-column prop="status" label="状态" :width="90" />
      <a-table-column label="操作" :width="150">
        <template #default="{ row }">
          <a-button text @click="openEditor(row)">
            编辑
          </a-button>
          <a-button text type="primary" @click="openAction(row)">
            加整改项
          </a-button>
        </template>
      </a-table-column>
    </a-table>

    <a-dialog v-model="dialogVisible" :title="editingId ? '编辑项目复盘' : '新建项目复盘'" width="660px">
      <a-form :model="form" label-width="100px">
        <a-form-item label="项目">
          <a-select v-model="form.projectId" filterable style="width:100%">
            <a-option
              v-for="project in projects"
              :key="project.id"
              :label="project.projectName"
              :value="project.id"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="问题分类">
          <a-select v-model="form.problemCategory">
            <a-option
              v-for="item in categoryOptions"
              :key="item.id"
              :label="item.itemLabel"
              :value="item.itemValue"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="复盘摘要">
          <a-textarea v-model="form.summary" :rows="4" />
        </a-form-item>
        <a-form-item label="经验总结">
          <a-textarea v-model="form.lessonsLearned" :rows="4" />
        </a-form-item>
        <a-form-item label="复盘状态">
          <a-segmented
            v-model="form.status"
            :options="[
              { label: '草稿', value: 'Draft' },
              { label: '整改中', value: 'InProgress' },
              { label: '已关闭', value: 'Closed' },
            ]"
          />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button type="primary" @click="save">
          保存
        </a-button>
      </template>
    </a-dialog>

    <a-dialog v-model="actionVisible" title="新增整改任务" width="560px">
      <a-form :model="action" label-width="90px">
        <a-form-item label="任务">
          <a-input v-model="action.title" />
        </a-form-item>
        <a-form-item label="责任人">
          <a-select v-model="action.ownerId" filterable style="width:100%">
            <a-option
              v-for="user in users"
              :key="user.id"
              :label="user.realName"
              :value="user.id"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="截止时间">
          <a-date-picker v-model="action.dueDate" value-format="YYYY-MM-DD" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button type="primary" @click="saveAction">
          添加
        </a-button>
      </template>
    </a-dialog>
  </section>
</template>

<style scoped lang="scss">
.action-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:3px 0; }
</style>
