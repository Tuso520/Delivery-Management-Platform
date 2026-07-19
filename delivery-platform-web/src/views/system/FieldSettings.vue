<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Message, Modal, type TableColumnData } from '@arco-design/web-vue'

import { fieldConfigurationApi } from '@/api/field-configuration'
import { BusinessTable } from '@/components/business'
import type { FieldCategory, FieldValue, SaveFieldValueDto } from '@/types/field-configuration'

const PAGE_SIZE = 10
const FIGMA_CATEGORY_CODES = new Set([
  'COUNTRY', 'CUSTOMER_TYPE', 'CONTRACT_TYPE', 'PRODUCT_TYPE', 'PROJECT_KEYWORD',
  'CURRENCY', 'PROJECT_STAGE', 'PROJECT_STATUS', 'JOB_POSITION', 'PROJECT_TYPE',
])
const categories = ref<FieldCategory[]>([])
const selectedCategoryId = ref('')
const values = ref<FieldValue[]>([])
const page = ref(1)
const total = ref(0)
const loadingCategories = ref(false)
const loadingValues = ref(false)
const loadError = ref('')
const saving = ref(false)
const modalVisible = ref(false)
const editing = ref<FieldValue | null>(null)
const form = reactive<SaveFieldValueDto>({
  name: '',
  code: '',
  sortOrder: 0,
  status: 'Active',
})

const selectedCategory = computed(() =>
  categories.value.find((item) => item.id === selectedCategoryId.value),
)
const requiresCode = computed(() =>
  ['COUNTRY', 'CURRENCY'].includes(selectedCategory.value?.categoryCode ?? ''),
)
const formActive = computed({
  get: () => form.status !== 'Inactive',
  set: (value: boolean) => {
    form.status = value ? 'Active' : 'Inactive'
  },
})
const columns: TableColumnData[] = [
  { title: '名称', dataIndex: 'name', slotName: 'name', minWidth: 260 },
  { title: '编码', dataIndex: 'code', slotName: 'code', width: 180 },
  { title: '排序', dataIndex: 'sortOrder', width: 120 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 140 },
  { title: '操作', slotName: 'actions', width: 160 },
]

async function loadCategories(): Promise<void> {
  loadingCategories.value = true
  try {
    categories.value = (await fieldConfigurationApi.getCategories())
      .filter((item) => FIGMA_CATEGORY_CODES.has(item.categoryCode))
    if (!categories.value.some((item) => item.id === selectedCategoryId.value)) {
      selectedCategoryId.value = categories.value[0]?.id ?? ''
    }
  } finally {
    loadingCategories.value = false
  }
}

async function loadValues(): Promise<void> {
  if (!selectedCategoryId.value) return
  loadingValues.value = true
  loadError.value = ''
  try {
    const result = await fieldConfigurationApi.getValues(selectedCategoryId.value, {
      page: page.value,
      pageSize: PAGE_SIZE,
    })
    values.value = result.items
    total.value = result.total
    if (result.total > 0 && result.items.length === 0 && page.value > 1) {
      page.value = Math.max(1, Math.ceil(result.total / PAGE_SIZE))
      await loadValues()
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '字段值加载失败'
  } finally {
    loadingValues.value = false
  }
}

async function selectCategory(id: string): Promise<void> {
  if (selectedCategoryId.value === id) return
  selectedCategoryId.value = id
  page.value = 1
  await loadValues()
}

async function changePage(nextPage: number): Promise<void> {
  page.value = nextPage
  await loadValues()
}

function openCreate(): void {
  editing.value = null
  Object.assign(form, {
    name: '',
    code: '',
    sortOrder: (page.value - 1) * PAGE_SIZE + values.value.length + 1,
    status: 'Active',
  })
  modalVisible.value = true
}

function openEdit(item: FieldValue): void {
  editing.value = item
  Object.assign(form, {
    name: item.name,
    code: item.code ?? '',
    sortOrder: item.sortOrder,
    status: item.status,
  })
  modalVisible.value = true
}

async function save(): Promise<boolean> {
  const name = form.name.trim()
  const code = form.code?.trim().toUpperCase() || undefined
  if (!name) {
    Message.warning('请输入字段名称')
    return false
  }
  if (requiresCode.value && !code) {
    Message.warning('当前分类必须填写编码')
    return false
  }
  if (code && !/^[A-Z][A-Z0-9_-]{0,99}$/u.test(code)) {
    Message.warning('编码只能包含大写字母、数字、下划线和连字符，且必须以字母开头')
    return false
  }
  saving.value = true
  try {
    const data: SaveFieldValueDto = {
      name,
      code,
      sortOrder: form.sortOrder ?? 0,
      status: form.status ?? 'Active',
    }
    if (editing.value) await fieldConfigurationApi.update(editing.value.id, data)
    else await fieldConfigurationApi.create(selectedCategoryId.value, data)
    Message.success(editing.value ? '字段值已更新' : '字段值已新增')
    modalVisible.value = false
    await Promise.all([loadCategories(), loadValues()])
    return true
  } finally {
    saving.value = false
  }
}

function remove(item: FieldValue): void {
  Modal.confirm({
    title: '确认删除字段值',
    content: `确定删除“${item.name}”吗？已被业务引用或系统初始化的字段不可删除。`,
    okText: '删除',
    cancelText: '取消',
    okButtonProps: { status: 'danger' },
    onBeforeOk: async (done) => {
      try {
        const reference = await fieldConfigurationApi.getReferenceStatus(item.id)
        if (reference.referenced) {
          Message.warning(`该字段已被引用 ${reference.total} 次，请编辑并改为停用`)
          done(false)
          return
        }
        await fieldConfigurationApi.remove(item.id)
        Message.success('字段值已删除')
        await Promise.all([loadCategories(), loadValues()])
        done(true)
      } catch {
        done(false)
      }
    },
  })
}

onMounted(async () => {
  await loadCategories()
  await loadValues()
})
</script>

<template>
  <section class="field-config-page" aria-labelledby="field-config-title">
    <h1 id="field-config-title" class="sr-only">
      字段配置
    </h1>

    <a-spin :loading="loadingCategories" class="category-tabs-spin">
      <div class="category-tabs" role="tablist" aria-label="字段分类">
        <button
          v-for="category in categories"
          :key="category.id"
          type="button"
          role="tab"
          :aria-selected="category.id === selectedCategoryId"
          :class="['category-tab', { active: category.id === selectedCategoryId }]"
          @click="selectCategory(category.id)"
        >
          {{ category.categoryName }}
        </button>
      </div>
    </a-spin>

    <BusinessTable
      class="field-value-table"
      :data="values"
      :columns="columns"
      :loading="loadingValues"
      :error="loadError"
      retry-label="重新加载"
      row-key="id"
      size="small"
      preserve-column-widths
      :scroll="{ x: 900 }"
      empty-title="暂无字段值"
      @retry="loadValues"
    >
      <template #name="{ record }">
        <span>{{ record.name }}</span>
      </template>
      <template #code="{ record }">
        {{ record.code || '—' }}
      </template>
      <template #status="{ record }">
        <a-tag :color="record.status === 'Active' ? 'green' : 'gray'">
          {{ record.status === 'Active' ? '启用' : '停用' }}
        </a-tag>
      </template>
      <template #actions="{ record }">
        <a-space :size="16">
          <a-button type="text" size="mini" @click="openEdit(record)">
            编辑
          </a-button>
          <a-button
            type="text"
            size="mini"
            status="danger"
            @click="remove(record)"
          >
            删除
          </a-button>
        </a-space>
      </template>
    </BusinessTable>

    <footer class="field-footer">
      <a-button type="primary" size="small" @click="openCreate">
        新增一行
      </a-button>
      <div class="pagination-group">
        <span>每页 {{ PAGE_SIZE }} 条</span>
        <a-pagination
          :current="page"
          :page-size="PAGE_SIZE"
          :total="total"
          size="small"
          :show-total="false"
          @change="changePage"
        />
      </div>
    </footer>
  </section>

  <a-modal
    v-model:visible="modalVisible"
    :title="editing ? '编辑字段值' : '新增字段值'"
    :width="576"
    :ok-loading="saving"
    ok-text="保存"
    cancel-text="取消"
    :on-before-ok="save"
  >
    <a-form :model="form" layout="vertical" class="field-value-form">
      <a-form-item label="字段名称" required>
        <a-input v-model="form.name" :max-length="100" placeholder="请输入字段名称" />
      </a-form-item>
      <a-form-item label="字段编码" :required="requiresCode">
        <a-input
          v-model="form.code"
          :disabled="Boolean(editing?.isSystemDefault)"
          :max-length="100"
          placeholder="请输入稳定编码"
          @input="form.code = form.code?.toUpperCase()"
        />
      </a-form-item>
      <a-form-item label="排序" required>
        <a-input-number v-model="form.sortOrder" :min="0" :max="999999" />
      </a-form-item>
      <a-form-item label="状态">
        <a-switch v-model="formActive" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<style scoped lang="scss">
.field-config-page {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 13px;
  background: #fff;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
.category-tabs-spin { flex: 0 0 auto; }
.category-tabs {
  height: 44px;
  display: flex;
  align-items: flex-end;
  gap: 24px;
  overflow-x: auto;
  padding: 0 16px;
  border-bottom: 1px solid #e5e6eb;
  scrollbar-width: thin;
}
.category-tab {
  height: 40px;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #4e5969;
  font-size: 14px;
  cursor: pointer;
}
.category-tab:hover { color: #165dff; }
.category-tab.active {
  border-bottom-color: #165dff;
  color: #165dff;
  font-weight: 500;
}
.field-value-table {
  min-height: 0;
  flex: 1;
  margin-top: 12px;
  border: 1px solid #e5e6eb;
}
.field-value-table :deep(.business-table__viewport) { max-height: none; }
.field-value-table :deep(.arco-table-th),
.field-value-table :deep(.arco-table-td) {
  height: 44px;
  padding: 0 16px;
  border-color: #e5e6eb;
  font-size: 13px;
}
.field-value-table :deep(.arco-table-th) {
  background: #f7f8fa;
  color: #374151;
  font-weight: 600;
}
.field-value-table :deep(.arco-tag) {
  height: 18px;
  padding: 0 8px;
  border: 0;
  border-radius: 2px;
  line-height: 18px;
}
.field-footer {
  min-height: 64px;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0;
}
.pagination-group {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #4e5969;
  font-size: 12px;
}
.field-value-form :deep(.arco-form-item) { margin-bottom: 20px; }
.field-value-form :deep(.arco-input-wrapper),
.field-value-form :deep(.arco-input-number) { border-radius: 2px; }
@media (max-width: 760px) {
  .field-config-page { padding: 8px; }
  .category-tabs { padding: 0 8px; }
  .field-footer { align-items: flex-start; flex-direction: column; }
  .pagination-group { width: 100%; justify-content: flex-end; overflow-x: auto; }
}
</style>
