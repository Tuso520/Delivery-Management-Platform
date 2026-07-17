<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message, Modal } from '@arco-design/web-vue'
import {
  IconEdit,
  IconLaunch,
  IconPlus,
  IconPoweroff,
  IconRefresh,
  IconTool,
} from '@arco-design/web-vue/es/icon'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'

import { toolApi } from '@/api/tools'
import { PageContainer, StatCard } from '@/components/business'
import { usePermission } from '@/composables/usePermission'
import { useToolsQuery } from '@/composables/queries/useOperationsQueries'
import { queryKeys } from '@/query/keys'
import type {
  CreateToolDefinitionDto,
  ToolDefinition,
  ToolType,
  UpdateToolDefinitionDto,
} from '@/types/tools'

interface CategorySummary {
  name: string
  total: number
  enabled: number
}

type ToolMutationVariables =
  | { kind: 'create'; data: CreateToolDefinitionDto }
  | { kind: 'update'; id: string; data: UpdateToolDefinitionDto }
  | { kind: 'enable'; id: string }
  | { kind: 'disable'; id: string }

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const { hasPermission } = usePermission()
const { t, locale } = useI18n()

const canManage = computed(() => hasPermission('tools:manage'))
const toolsQuery = useToolsQuery(canManage)
const tools = computed<ToolDefinition[]>(() => toolsQuery.data.value ?? [])
const activeCategory = ref(typeof route.query.category === 'string' ? route.query.category : '')
const editorVisible = ref(false)
const editingId = ref('')

const formData = reactive({
  name: '',
  category: '',
  description: '',
  toolType: 'INTERNAL' as ToolType,
  routeOrUrl: '',
  sortOrder: 0,
  configurationText: '{}',
})

const categories = computed<CategorySummary[]>(() => {
  const summaries = new Map<string, CategorySummary>()
  for (const tool of tools.value) {
    const current = summaries.get(tool.category) ?? {
      name: tool.category,
      total: 0,
      enabled: 0,
    }
    current.total += 1
    if (tool.enabled) current.enabled += 1
    summaries.set(tool.category, current)
  }
  return [...summaries.values()].sort((left, right) =>
    left.name.localeCompare(right.name, locale.value),
  )
})

const visibleTools = computed(() => {
  if (!activeCategory.value) return tools.value
  return tools.value.filter((tool) => tool.category === activeCategory.value)
})
const visibleToolCount = ref(20)
const renderedTools = computed(() => visibleTools.value.slice(0, visibleToolCount.value))
const allEnabledCount = computed(() => tools.value.filter((tool) => tool.enabled).length)

watch([visibleTools, activeCategory], () => {
  visibleToolCount.value = 20
})

function loadMoreTools(event: Event): void {
  const container = event.currentTarget as HTMLElement
  const remaining = container.scrollHeight - container.scrollTop - container.clientHeight
  if (remaining <= 120 && visibleToolCount.value < visibleTools.value.length) {
    visibleToolCount.value = Math.min(visibleToolCount.value + 20, visibleTools.value.length)
  }
}

const toolMutation = useMutation({
  mutationFn: (variables: ToolMutationVariables) => {
    switch (variables.kind) {
      case 'create':
        return toolApi.create(variables.data)
      case 'update':
        return toolApi.update(variables.id, variables.data)
      case 'enable':
        return toolApi.enable(variables.id)
      case 'disable':
        return toolApi.disable(variables.id)
    }
  },
  retry: false,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.tools.lists() })
  },
})

const selectCategory = (category: string) => {
  activeCategory.value = category
  void router.replace({
    path: route.path,
    query: category ? { category } : {},
  })
}

const resetForm = () => {
  editingId.value = ''
  formData.name = ''
  formData.category = activeCategory.value
  formData.description = ''
  formData.toolType = 'INTERNAL'
  formData.routeOrUrl = ''
  formData.sortOrder = 0
  formData.configurationText = '{}'
}

const openCreate = () => {
  resetForm()
  editorVisible.value = true
}

const openEdit = (tool: ToolDefinition) => {
  editingId.value = tool.id
  formData.name = tool.name
  formData.category = tool.category
  formData.description = tool.description ?? ''
  formData.toolType = tool.toolType
  formData.routeOrUrl = tool.routeOrUrl ?? ''
  formData.sortOrder = tool.sortOrder
  formData.configurationText = JSON.stringify(tool.configuration ?? {}, null, 2)
  editorVisible.value = true
}

const parseConfiguration = (): Record<string, unknown> => {
  const source = formData.configurationText.trim()
  if (!source) return {}

  const parsed: unknown = JSON.parse(source)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(t('tools.validation.configuration'))
  }
  return parsed as Record<string, unknown>
}

const validateForm = () => {
  if (!formData.name.trim()) throw new Error(t('tools.validation.name'))
  if (!formData.category.trim()) throw new Error(t('tools.validation.category'))

  const routeOrUrl = formData.routeOrUrl.trim()
  if (formData.toolType === 'EXTERNAL') {
    if (!routeOrUrl) throw new Error(t('tools.validation.externalUrl'))
    const parsed = new URL(routeOrUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(t('tools.validation.httpOnly'))
    }
  } else if (routeOrUrl && !routeOrUrl.startsWith('/')) {
    throw new Error(t('tools.validation.internalRoute'))
  }
}

const saveTool = async () => {
  try {
    validateForm()
    const data = {
      name: formData.name.trim(),
      category: formData.category.trim(),
      description: formData.description.trim(),
      toolType: formData.toolType,
      routeOrUrl: formData.routeOrUrl.trim(),
      sortOrder: formData.sortOrder,
      configuration: parseConfiguration(),
    }
    if (editingId.value) {
      await toolMutation.mutateAsync({ kind: 'update', id: editingId.value, data })
      Message.success(t('tools.updated'))
    } else {
      await toolMutation.mutateAsync({ kind: 'create', data })
      Message.success(t('tools.created'))
    }
    editorVisible.value = false
  } catch (error) {
    Message.error(error instanceof Error ? error.message : t('tools.saveFailed'))
  }
}

const setToolEnabled = async (tool: ToolDefinition, enabled: boolean) => {
  try {
    await toolMutation.mutateAsync({
      kind: enabled ? 'enable' : 'disable',
      id: tool.id,
    })
    Message.success(enabled ? t('tools.enabledMessage') : t('tools.disabledMessage'))
  } catch {
    Message.error(enabled ? t('tools.enableFailed') : t('tools.disableFailed'))
  }
}

const toggleTool = (tool: ToolDefinition) => {
  if (!tool.enabled) {
    void setToolEnabled(tool, true)
    return
  }

  Modal.confirm({
    title: t('tools.disableTitle'),
    content: t('tools.disableConfirm', { name: tool.name }),
    okText: t('tools.disable'),
    cancelText: t('common.cancel'),
    okButtonProps: { status: 'danger' },
    onOk: () => setToolEnabled(tool, false),
  })
}

const openTool = async (tool: ToolDefinition) => {
  if (!tool.routeOrUrl) {
    Message.info(t('tools.missingEntry'))
    return
  }

  if (tool.toolType === 'INTERNAL') {
    await router.push(tool.routeOrUrl)
    return
  }

  try {
    const parsed = new URL(tool.routeOrUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported')
    window.open(parsed.toString(), '_blank', 'noopener,noreferrer')
  } catch {
    Message.error(t('tools.invalidUrl'))
  }
}
</script>

<template>
  <PageContainer class="tools-page" gap="compact" :scrollable="false">
    <section class="category-summary-grid" :aria-label="t('tools.catalog')">
      <StatCard
        :label="t('tools.all')"
        :value="tools.length"
        :active="!activeCategory"
        interactive
        tone="blue"
        @select="selectCategory('')"
      >
        <small v-if="canManage">{{ allEnabledCount }} {{ t('tools.enabled') }}</small>
      </StatCard>
      <StatCard
        v-for="(category, index) in categories"
        :key="category.name"
        :label="category.name"
        :value="category.total"
        :active="activeCategory === category.name"
        interactive
        :tone="(['green', 'cyan', 'red', 'blue'] as const)[index % 4]"
        @select="selectCategory(category.name)"
      >
        <small v-if="canManage">{{ category.enabled }} {{ t('tools.enabled') }}</small>
      </StatCard>
    </section>

    <main class="catalog-panel">
      <header class="catalog-heading">
        <div>
          <h1>{{ activeCategory || t('tools.all') }}</h1>
          <p>
            {{ canManage ? t('tools.managerDescription') : t('tools.userDescription') }}
          </p>
        </div>
        <a-space>
          <a-button :loading="toolsQuery.isFetching.value" @click="toolsQuery.refetch()">
            <template #icon>
              <IconRefresh />
            </template>
            {{ t('tools.refresh') }}
          </a-button>
          <a-button v-if="canManage" type="primary" @click="openCreate">
            <template #icon>
              <IconPlus />
            </template>
            {{ t('tools.create') }}
          </a-button>
        </a-space>
      </header>

      <a-skeleton v-if="toolsQuery.isPending.value" :animation="true" :loading="true">
        <a-space direction="vertical" fill>
          <a-skeleton-line :rows="6" />
        </a-space>
      </a-skeleton>

      <a-result
        v-else-if="toolsQuery.isError.value"
        status="error"
        :title="t('tools.loadFailed')"
        :subtitle="t('tools.retryHint')"
      >
        <template #extra>
          <a-button type="primary" @click="toolsQuery.refetch()">
            {{ t('common.retry') }}
          </a-button>
        </template>
      </a-result>

      <a-empty v-else-if="visibleTools.length === 0" :description="t('tools.empty')" />

      <div v-else class="tool-scroll" @scroll.passive="loadMoreTools">
        <section class="tool-grid" :aria-label="t('tools.listAria')">
          <a-card
            v-for="tool in renderedTools"
            :key="tool.id"
            class="tool-card"
            :class="{ disabled: !tool.enabled }"
            :bordered="true"
          >
            <div class="tool-card-heading">
              <span class="tool-icon"><IconTool /></span>
              <div class="tool-title">
                <h3>{{ tool.name }}</h3>
                <a-space size="mini">
                  <a-tag :color="tool.toolType === 'EXTERNAL' ? 'arcoblue' : 'purple'">
                    {{ tool.toolType === 'EXTERNAL' ? t('tools.external') : t('tools.internal') }}
                  </a-tag>
                  <a-tag v-if="canManage" :color="tool.enabled ? 'green' : 'gray'">
                    {{ tool.enabled ? t('tools.enabled') : t('tools.disabled') }}
                  </a-tag>
                </a-space>
              </div>
            </div>

            <p class="tool-description">
              {{ tool.description || t('tools.noDescription') }}
            </p>

            <footer class="tool-actions">
              <a-button
                type="primary"
                size="small"
                :disabled="!tool.enabled || !tool.routeOrUrl"
                @click="openTool(tool)"
              >
                <template #icon>
                  <IconLaunch />
                </template>
                {{ t('tools.open') }}
              </a-button>
              <a-space v-if="canManage" size="mini">
                <a-button type="text" size="small" @click="openEdit(tool)">
                  <template #icon>
                    <IconEdit />
                  </template>
                  {{ t('common.edit') }}
                </a-button>
                <a-button
                  type="text"
                  size="small"
                  :status="tool.enabled ? 'danger' : 'success'"
                  @click="toggleTool(tool)"
                >
                  <template #icon>
                    <IconPoweroff />
                  </template>
                  {{ tool.enabled ? t('tools.disable') : t('tools.enable') }}
                </a-button>
              </a-space>
            </footer>
          </a-card>
        </section>
      </div>
    </main>

    <a-modal
      v-model:visible="editorVisible"
      :title="editingId ? t('tools.editTitle') : t('tools.createTitle')"
      :width="600"
      :footer="false"
      :mask-closable="false"
    >
      <a-form :model="formData" layout="vertical">
        <div class="form-grid">
          <a-form-item :label="t('tools.name')" required>
            <a-input
              v-model="formData.name"
              :max-length="200"
              :placeholder="t('tools.namePlaceholder')"
            />
          </a-form-item>
          <a-form-item :label="t('tools.category')" required>
            <a-input
              v-model="formData.category"
              :max-length="100"
              :placeholder="t('tools.categoryPlaceholder')"
            />
          </a-form-item>
        </div>

        <a-form-item :label="t('tools.description')">
          <a-textarea
            v-model="formData.description"
            :max-length="2000"
            :auto-size="{ minRows: 2, maxRows: 5 }"
            show-word-limit
          />
        </a-form-item>

        <div class="form-grid">
          <a-form-item :label="t('tools.type')" required>
            <a-radio-group v-model="formData.toolType" type="button">
              <a-radio value="INTERNAL">
                {{ t('tools.internal') }}
              </a-radio>
              <a-radio value="EXTERNAL">
                {{ t('tools.external') }}
              </a-radio>
            </a-radio-group>
          </a-form-item>
          <a-form-item :label="t('tools.sortOrder')">
            <a-input-number v-model="formData.sortOrder" :min="0" :precision="0" />
          </a-form-item>
        </div>

        <a-form-item
          :label="
            formData.toolType === 'EXTERNAL' ? t('tools.externalUrl') : t('tools.internalRoute')
          "
        >
          <a-input
            v-model="formData.routeOrUrl"
            :max-length="500"
            :placeholder="formData.toolType === 'EXTERNAL' ? 'https://...' : '/tools/example'"
          />
        </a-form-item>

        <a-form-item :label="t('tools.configuration')">
          <a-textarea
            v-model="formData.configurationText"
            class="configuration-editor"
            :auto-size="{ minRows: 4, maxRows: 10 }"
            placeholder="{}"
          />
        </a-form-item>
      </a-form>

      <div class="modal-actions">
        <a-button @click="editorVisible = false">
          {{ t('common.cancel') }}
        </a-button>
        <a-button type="primary" :loading="toolMutation.isPending.value" @click="saveTool">
          {{ t('common.save') }}
        </a-button>
      </div>
    </a-modal>
  </PageContainer>
</template>

<style scoped lang="scss">
.tools-page {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.category-summary-grid {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px 20px;
}

.catalog-heading {
  h1,
  h2,
  p {
    margin: 0;
  }

  h1,
  h2 {
    color: var(--color-text-1);
  }

  p {
    margin-top: 4px;
    color: var(--color-text-3);
    font-size: 12px;
  }
}

.category-summary-grid small {
  display: block;
  margin-top: 6px;
  color: var(--color-text-3);
  font-size: 12px;
}

.catalog-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-2);
}

.catalog-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  h1 {
    font-size: 18px;
  }
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  column-gap: 24px;
  row-gap: 20px;
}

.tool-scroll {
  min-height: 0;
  flex: 1;
  padding: 2px;
  overflow: auto;
}

.tool-card {
  min-height: 184px;

  &.disabled {
    opacity: 0.72;
  }
}

.tool-card-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.tool-icon {
  display: inline-flex;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: rgb(var(--primary-6));
  font-size: 20px;
  background: var(--color-primary-light-1);
}

.tool-title {
  min-width: 0;

  h3 {
    margin: 0 0 6px;
    overflow: hidden;
    color: var(--color-text-1);
    font-size: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.tool-description {
  min-height: 40px;
  margin: 16px 0;
  overflow: hidden;
  color: var(--color-text-3);
  font-size: 13px;
  line-height: 20px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.tool-actions,
.modal-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.configuration-editor :deep(textarea) {
  font-family: Consolas, 'SFMono-Regular', monospace;
}

.modal-actions {
  justify-content: flex-end;
  padding-top: 8px;
}

@media (max-width: 900px) {
  .category-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
}

@media (max-width: 600px) {
  .catalog-heading,
  .form-grid {
    display: grid;
    grid-template-columns: 1fr;
  }

  .category-summary-grid,
  .tool-grid {
    grid-template-columns: 1fr;
  }
}
</style>
