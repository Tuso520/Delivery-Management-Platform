<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm } from '@/utils/arco-dialog'
import { toolApi } from '@/api/tools'
import type { ToolCategory, ToolItem } from '@/types/tools'
import type { TagType } from '@/types/ui'
const loading = ref(false)
const categories = ref<ToolCategory[]>([])
const activeCategoryId = ref('')
const toolItems = ref<ToolItem[]>([])
const dialogVisible = ref(false)
const isEditDialog = ref(false)
const dialogMode = ref<'category' | 'item'>('item')
const editingId = ref('')
const formData = ref({
  name: '',
  description: '',
  categoryId: '',
  toolType: 'internal',
  url: '',
  icon: '',
  sortOrder: 0,
})
const categoryFormData = ref({
  name: '',
  description: '',
  sortOrder: 0,
})
const activeCategory = computed(() => {
  if (!activeCategoryId.value) return null
  return categories.value.find((c) => c.id === activeCategoryId.value)
})
const fetchData = async () => {
  loading.value = true
  try {
    const catRes = await toolApi.getCategories()
    categories.value = catRes
    const itemRes = await toolApi.getItems(activeCategoryId.value || undefined)
    toolItems.value = itemRes
  } catch {
    categories.value = []
    toolItems.value = []
  } finally {
    loading.value = false
  }
}
const selectCategory = (categoryId: string) => {
  activeCategoryId.value = activeCategoryId.value === categoryId ? '' : categoryId
  fetchData()
}
const openItemDialog = (item?: ToolItem) => {
  isEditDialog.value = !!item
  dialogMode.value = 'item'
  editingId.value = item?.id || ''
  if (item) {
    formData.value = {
      name: item.name,
      description: item.description || '',
      categoryId: item.categoryId,
      toolType: item.toolType,
      url: item.url || '',
      icon: item.icon || '',
      sortOrder: item.sortOrder,
    }
  } else {
    formData.value = {
      name: '',
      description: '',
      categoryId: activeCategoryId.value,
      toolType: 'internal',
      url: '',
      icon: '',
      sortOrder: 0,
    }
  }
  dialogVisible.value = true
}
const openCategoryDialog = (cat?: ToolCategory) => {
  isEditDialog.value = !!cat
  dialogMode.value = 'category'
  editingId.value = cat?.id || ''
  if (cat) {
    categoryFormData.value = {
      name: cat.name,
      description: cat.description || '',
      sortOrder: cat.sortOrder,
    }
  } else {
    categoryFormData.value = {
      name: '',
      description: '',
      sortOrder: 0,
    }
  }
  dialogVisible.value = true
}
const handleSubmit = async () => {
  loading.value = true
  try {
    if (dialogMode.value === 'item') {
      if (isEditDialog.value) {
        await toolApi.updateItem(editingId.value, formData.value)
      } else {
        await toolApi.createItem(formData.value)
      }
    } else {
      if (isEditDialog.value) {
        await toolApi.updateCategory(editingId.value, categoryFormData.value)
      } else {
        await toolApi.createCategory(categoryFormData.value)
      }
    }
    Message.success(isEditDialog.value ? '更新成功' : '创建成功')
    dialogVisible.value = false
    fetchData()
  } catch {
    Message.error(isEditDialog.value ? '更新失败' : '创建失败')
  } finally {
    loading.value = false
  }
}
const handleDeleteItem = async (item: ToolItem) => {
  try {
    await arcoConfirm(`确定删除工具"${item.name}"吗？`, '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await toolApi.deleteItem(item.id)
    Message.success('删除成功')
    fetchData()
  } catch { return }
}
const handleDeleteCategory = async (cat: ToolCategory) => {
  try {
    await arcoConfirm(
      `确定删除分类“${cat.name}”吗？分类下有工具时将无法删除。`,
      '确认删除',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' },
    )
    await toolApi.deleteCategory(cat.id)
    Message.success('删除成功')
    fetchData()
  } catch { return }
}
const toolTypeTag: Record<string, TagType> = {
  internal: 'info',
  external: 'success',
}
const getToolTagType = (toolType: string): TagType => {
  return toolTypeTag[toolType] || 'info'
}
const toolTypeLabel: Record<string, string> = {
  internal: '内部',
  external: '外部',
}
const openUrl = (url: string) => {
  if (!url) return
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      Message.warning('不支持的URL协议')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    Message.warning('无效的URL')
  }
}
onMounted(() => {
  fetchData()
})
</script>
<template>
  <div class="tools-page">
    <a-card class="category-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">工具分类</span>
          <a-button size="small" type="primary" @click="openCategoryDialog()">
            新增分类
          </a-button>
        </div>
      </template>
      <div class="category-tabs">
        <div
          v-for="cat in categories"
          :key="cat.id"
          class="category-tab"
          :class="{ active: activeCategoryId === cat.id }"
          @click="selectCategory(cat.id)"
        >
          <div class="category-tab-content">
            <span class="category-tab-name">{{ cat.name }}</span>
            <span class="category-tab-count">{{ cat.tools?.length || 0 }}</span>
          </div>
          <div class="category-tab-actions" @click.stop>
            <a-button
              text
              type="primary"
              size="small"
              @click="openCategoryDialog(cat)"
            >
              编辑
            </a-button>
            <a-button
              text
              status="danger" type="secondary"
              size="small"
              @click="handleDeleteCategory(cat)"
            >
              删除
            </a-button>
          </div>
        </div>
      </div>
    </a-card>
    <a-card class="tools-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">
            {{ activeCategory ? activeCategory.name : '全部工具' }}
          </span>
          <a-button type="primary" :disabled="!activeCategoryId" @click="openItemDialog()">
            新增工具
          </a-button>
        </div>
      </template>
      <a-empty v-if="toolItems.length === 0" :description="activeCategoryId ? '该分类下暂无工具' : '请选择一个分类查看工具'" />
      <a-row v-else :gutter="16">
        <a-col
          v-for="item in toolItems"
          :key="item.id"
          :xs="24"
          :sm="12"
          :md="8"
          :lg="6"
        >
          <a-card class="tool-card" shadow="hover">
            <div class="tool-card-content">
              <div class="tool-icon-wrapper">
                <a-icon :size="32" color="#165dff">
                  <Connection />
                </a-icon>
              </div>
              <h3 class="tool-name">
                {{ item.name }}
              </h3>
              <p v-if="item.description" class="tool-desc">
                {{ item.description }}
              </p>
              <div class="tool-footer">
                <a-tag :type="getToolTagType(item.toolType)" size="small">
                  {{ toolTypeLabel[item.toolType] }}
                </a-tag>
                <div class="tool-actions">
                  <a-button
                    v-if="item.toolType === 'external' && item.url"
                    text
                    type="primary"
                    size="small"
                    @click="openUrl(item.url!)"
                  >
                    访问
                  </a-button>
                  <a-button
                    text
                    type="primary"
                    size="small"
                    @click="openItemDialog(item)"
                  >
                    编辑
                  </a-button>
                  <a-button
                    text
                    status="danger" type="secondary"
                    size="small"
                    @click="handleDeleteItem(item)"
                  >
                    删除
                  </a-button>
                </div>
              </div>
            </div>
          </a-card>
        </a-col>
      </a-row>
    </a-card>
    <a-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'item'
        ? (isEditDialog ? '编辑工具' : '新增工具')
        : (isEditDialog ? '编辑分类' : '新增分类')"
      width="520px"
      :close-on-click-modal="false"
    >
      <a-form v-if="dialogMode === 'category'" :model="categoryFormData" label-width="100px">
        <a-form-item label="分类名称" required>
          <a-input v-model="categoryFormData.name" :maxlength="100" show-word-limit />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model="categoryFormData.description" :rows="2" />
        </a-form-item>
        <a-form-item label="排序号">
          <a-input-number v-model="categoryFormData.sortOrder" :min="0" />
        </a-form-item>
      </a-form>
      <a-form v-else :model="formData" label-width="100px">
        <a-form-item label="工具名称" required>
          <a-input v-model="formData.name" :maxlength="200" show-word-limit />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model="formData.description" :rows="2" />
        </a-form-item>
        <a-form-item label="工具类型">
          <a-radio-group v-model="formData.toolType">
            <a-radio value="internal">
              内部工具
            </a-radio>
            <a-radio value="external">
              外部链接
            </a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item v-if="formData.toolType === 'external'" label="URL">
          <a-input v-model="formData.url" :maxlength="500" placeholder="https://..." />
        </a-form-item>
        <a-form-item label="图标">
          <a-input v-model="formData.icon" :maxlength="100" placeholder="Arco Design 图标名" />
        </a-form-item>
        <a-form-item label="排序号">
          <a-input-number v-model="formData.sortOrder" :min="0" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="dialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" :loading="loading" @click="handleSubmit">
          确定
        </a-button>
      </template>
    </a-dialog>
  </div>
</template>
<style scoped lang="scss">
.tools-page {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 6px;
  align-items: stretch;
  padding: 0;
  overflow: hidden;
}
.category-card {
  min-width: 0;
  height: 100%;
  border-radius: 0;
  overflow: hidden;
}
.category-card :deep(.arco-card__body),
.tools-card :deep(.arco-card__body) {
  min-height: 0;
  overflow-y: auto;
}
.category-tabs {
  display: grid;
  gap: 4px;
}
.category-tab {
  padding: 8px 10px;
  cursor: pointer;
  border-radius: 0;
  transition: all 0.2s;
  margin-bottom: 0;
  &:hover {
    background-color: var(--app-surface-subtle);
  }
  &.active {
    background-color: #e8f3ff;
  }
}
.category-tab-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.category-tab-name {
  font-size: 14px;
  color: var(--app-text);
  font-weight: 500;
}
.category-tab-count {
  font-size: 12px;
  color: var(--app-text-muted);
  background-color: var(--app-surface-subtle);
  padding: 0 6px;
  border-radius: 0;
  height: 18px;
  line-height: 18px;
}
.category-tab-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}
.category-tab:hover .category-tab-actions {
  opacity: 1;
}
.tools-card {
  min-width: 0;
  height: 100%;
  border-radius: 0;
  overflow: hidden;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-title {
  font-size: 16px;
  font-weight: 600;
}
.tool-card {
  height: calc(100% - 12px);
  margin-bottom: 12px;
  border-radius: 0;
  box-shadow: none !important;
}
.tool-card-content {
  min-height: 166px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.tool-icon-wrapper {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #e8f3ff;
  border-radius: 0;
  margin-bottom: 12px;
}
.tool-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0 0 6px;
}
.tool-desc {
  font-size: 13px;
  color: var(--app-text-muted);
  margin: 0 0 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tool-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-top: auto;
}
.tool-actions {
  display: flex;
  gap: 4px;
}
.empty-hint {
  text-align: center;
  padding: 48px;
  color: var(--app-text-muted);
  font-size: 14px;
}

@media (max-width: 980px) {
  .tools-page {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(128px, 200px) minmax(0, 1fr);
  }
}
</style>
