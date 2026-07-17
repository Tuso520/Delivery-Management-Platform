<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Message, Modal, type TableColumnData } from '@arco-design/web-vue'

import { fieldConfigurationApi } from '@/api/field-configuration'
import { BusinessTable, SectionCard } from '@/components/business'
import type { FieldCategory, FieldValue, SaveFieldValueDto } from '@/types/field-configuration'

const categories = ref<FieldCategory[]>([])
const selectedCategoryId = ref('')
const values = ref<FieldValue[]>([])
const keyword = ref('')
const loadingCategories = ref(false)
const loadingValues = ref(false)
const saving = ref(false)
const modalVisible = ref(false)
const editing = ref<FieldValue | null>(null)
const form = reactive<SaveFieldValueDto>({ name: '', code: '', sortOrder: 0 })

const selectedCategory = computed(() => categories.value.find((item) => item.id === selectedCategoryId.value))
const requiresCode = computed(() => ['COUNTRY', 'CURRENCY'].includes(selectedCategory.value?.categoryCode ?? ''))
const columns: TableColumnData[] = [
  { title: '名称', dataIndex: 'name', slotName: 'name', minWidth: 150 },
  { title: '编码', dataIndex: 'code', slotName: 'code', minWidth: 130 },
  { title: '排序', dataIndex: 'sortOrder', slotName: 'sortOrder', width: 120 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 90 },
  { title: '更新时间', dataIndex: 'updatedAt', slotName: 'updatedAt', minWidth: 170 },
  { title: '操作', slotName: 'actions', width: 260, fixed: 'right' },
]

async function loadCategories(): Promise<void> {
  loadingCategories.value = true
  try {
    categories.value = await fieldConfigurationApi.getCategories()
    if (!categories.value.some((item) => item.id === selectedCategoryId.value)) selectedCategoryId.value = categories.value[0]?.id ?? ''
  } finally {
    loadingCategories.value = false
  }
}

async function loadValues(): Promise<void> {
  if (!selectedCategoryId.value) return
  loadingValues.value = true
  try { values.value = await fieldConfigurationApi.getValues(selectedCategoryId.value, keyword.value.trim()) }
  finally { loadingValues.value = false }
}

async function selectCategory(id: string): Promise<void> {
  selectedCategoryId.value = id
  keyword.value = ''
  await loadValues()
}

function openCreate(): void {
  editing.value = null
  Object.assign(form, { name: '', code: '', sortOrder: (values.value.at(-1)?.sortOrder ?? 0) + 10 })
  modalVisible.value = true
}

function openEdit(item: FieldValue): void {
  editing.value = item
  Object.assign(form, { name: item.name, code: item.code ?? '', sortOrder: item.sortOrder })
  modalVisible.value = true
}

async function save(): Promise<void> {
  const name = form.name.trim()
  const code = form.code?.trim().toUpperCase() || undefined
  if (!name) return void Message.warning('请输入字段名称')
  if (requiresCode.value && !code) return void Message.warning('当前分类必须填写编码')
  if (code && !/^[A-Z][A-Z0-9_-]{0,99}$/u.test(code)) return void Message.warning('编码只能包含大写字母、数字、下划线和连字符，且必须以字母开头')
  saving.value = true
  try {
    const data = { name, code, sortOrder: form.sortOrder ?? 0 }
    if (editing.value) await fieldConfigurationApi.update(editing.value.id, data)
    else await fieldConfigurationApi.create(selectedCategoryId.value, data)
    Message.success(editing.value ? '字段值已更新' : '字段值已新增')
    modalVisible.value = false
    await Promise.all([loadCategories(), loadValues()])
  } finally { saving.value = false }
}

async function changeStatus(item: FieldValue): Promise<void> {
  const next = item.status === 'Active' ? 'Inactive' : 'Active'
  await fieldConfigurationApi.changeStatus(item.id, next)
  Message.success(next === 'Active' ? '字段值已启用' : '字段值已停用')
  await loadValues()
}

function remove(item: FieldValue): void {
  Modal.confirm({
    title: '确认删除字段值',
    content: `确定删除“${item.name}”吗？已被业务引用或系统初始化的字段不可删除。`,
    okText: '删除', cancelText: '取消', okButtonProps: { status: 'danger' },
    onBeforeOk: async (done) => {
      try {
        const reference = await fieldConfigurationApi.getReferenceStatus(item.id)
        if (reference.referenced) {
          Message.warning(`该字段已被引用 ${reference.total} 次，请改为停用`)
          done(false)
          return
        }
        await fieldConfigurationApi.remove(item.id)
        Message.success('字段值已删除')
        await Promise.all([loadCategories(), loadValues()])
        done(true)
      } catch { done(false) }
    },
  })
}

async function move(item: FieldValue, direction: -1 | 1): Promise<void> {
  const index = values.value.findIndex((value) => value.id === item.id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= values.value.length) return
  const reordered = [...values.value]
  ;[reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!]
  await fieldConfigurationApi.sort(selectedCategoryId.value, reordered.map((value, order) => ({ id: value.id, sortOrder: (order + 1) * 10 })))
  await loadValues()
}

function formatTime(value: string): string { return new Date(value).toLocaleString('zh-CN', { hour12: false }) }

onMounted(async () => { await loadCategories(); await loadValues() })
</script>

<template>
  <SectionCard
    title="字段设置"
    description="统一维护项目、标准库、知识库等模块使用的可选项。"
    class="field-settings"
    :bordered="false"
  >
    <div class="field-layout">
      <aside class="category-panel" aria-label="字段分类">
        <a-spin :loading="loadingCategories">
          <button
            v-for="category in categories"
            :key="category.id"
            type="button"
            :class="['category-item', { active: category.id === selectedCategoryId }]"
            @click="selectCategory(category.id)"
          >
            <span>{{ category.categoryName }}</span><a-badge :count="category._count.items" :max-count="999" />
          </button>
        </a-spin>
      </aside>
      <div class="value-panel">
        <div class="field-toolbar">
          <a-input
            v-model="keyword"
            allow-clear
            placeholder="搜索名称或编码，回车查询"
            class="field-search"
            @press-enter="loadValues"
            @clear="loadValues"
          />
          <div class="toolbar-actions">
            <a-button @click="loadValues">
              刷新
            </a-button>
            <a-button type="primary" @click="openCreate">
              新增字段值
            </a-button>
          </div>
        </div>
        <BusinessTable
          :data="values"
          :columns="columns"
          :loading="loadingValues"
          row-key="id"
          size="small"
          :scroll="{ x: 980 }"
          empty-title="暂无字段值"
        >
          <template #name="{ record }">
            <span>{{ record.name }}</span><a-tag v-if="record.isSystemDefault" size="small" class="system-tag">
              系统
            </a-tag>
          </template>
          <template #code="{ record }">
            {{ record.code || '—' }}
          </template>
          <template #sortOrder="{ record }">
            <a-space size="mini">
              <span>{{ record.sortOrder }}</span><a-button size="mini" type="text" @click="move(record, -1)">
                上移
              </a-button><a-button size="mini" type="text" @click="move(record, 1)">
                下移
              </a-button>
            </a-space>
          </template>
          <template #status="{ record }">
            <a-tag :color="record.status === 'Active' ? 'green' : 'gray'">
              {{ record.status === 'Active' ? '启用' : '停用' }}
            </a-tag>
          </template>
          <template #updatedAt="{ record }">
            {{ formatTime(record.updatedAt) }}
          </template>
          <template #actions="{ record }">
            <a-space>
              <a-button size="mini" type="text" @click="openEdit(record)">
                编辑
              </a-button><a-button size="mini" type="text" @click="changeStatus(record)">
                {{ record.status === 'Active' ? '停用' : '启用' }}
              </a-button><a-button
                size="mini"
                type="text"
                status="danger"
                @click="remove(record)"
              >
                删除
              </a-button>
            </a-space>
          </template>
        </BusinessTable>
      </div>
    </div>
  </SectionCard>

  <a-modal
    v-model:visible="modalVisible"
    :title="editing ? '编辑字段值' : '新增字段值'"
    :ok-loading="saving"
    ok-text="保存"
    cancel-text="取消"
    @ok="save"
  >
    <a-form :model="form" layout="vertical">
      <a-form-item label="名称" required>
        <a-input v-model="form.name" :max-length="100" placeholder="请输入字段名称" />
      </a-form-item>
      <a-form-item :label="requiresCode ? '编码（必填）' : '编码（选填）'">
        <a-input
          v-model="form.code"
          :disabled="Boolean(editing?.isSystemDefault)"
          :max-length="100"
          placeholder="自动转为大写，如 EPC_INTEGRATED"
          @input="form.code = form.code?.toUpperCase()"
        /><template #extra>
          <span v-if="editing?.isSystemDefault">系统初始化字段的稳定编码不可修改</span><span v-else>仅支持大写字母、数字、下划线和连字符</span>
        </template>
      </a-form-item>
      <a-form-item label="排序">
        <a-input-number v-model="form.sortOrder" :min="0" :max="999999" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<style scoped lang="scss">
.field-settings { min-width: 0; }
.field-layout { display: grid; grid-template-columns: 210px minmax(0, 1fr); min-height: 480px; gap: 16px; }
.category-panel { padding: 8px; border: 1px solid var(--color-border-2); border-radius: 6px; background: var(--color-fill-1); }
.category-item { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 10px; border: 0; border-radius: 4px; color: var(--color-text-2); background: transparent; cursor: pointer; text-align: left; white-space: nowrap; }
.category-item:hover, .category-item.active { color: rgb(var(--primary-6)); background: var(--color-primary-light-1); }
.value-panel { min-width: 0; }
.field-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.field-search { width: min(320px, 100%); }
.toolbar-actions { display: flex; flex: 0 0 auto; gap: 8px; }
.system-tag { margin-left: 6px; }
@media (max-width: 960px) { .field-layout { grid-template-columns: 1fr; } .category-panel { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 680px) { .category-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); } .field-toolbar { align-items: stretch; flex-direction: column; } .field-search { width: 100%; } .toolbar-actions { justify-content: flex-end; } }
</style>
