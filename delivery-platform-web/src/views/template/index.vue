<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { arcoConfirm } from '@/utils/arco-dialog'
import { templateApi } from '@/api/template'
import { attachmentApi } from '@/api/attachment'
import type { DocumentTemplate, QueryTemplateDto } from '@/types/template'
import type { PaginatedData } from '@/types/api'
import type { TagType } from '@/types/ui'
import { downloadBlob } from '@/utils/blob'

interface TemplateStage {
  code: string
  name: string
  description: string
}

interface TemplateSection {
  stage: TemplateStage
  templates: DocumentTemplate[]
}

const router = useRouter()

const loading = ref(false)
const templateList = ref<DocumentTemplate[]>([])
const activeStageCode = ref('')
const templateStreamRef = ref<HTMLElement>()

const stages: TemplateStage[] = [
  { code: '01_presale', name: '售前与启动', description: '立项、启动会、项目计划和职责分工模板' },
  { code: '02_design', name: '设计与配置', description: '设计说明、点表、软件配置和评审模板' },
  { code: '03_procurement', name: '采购与物流', description: '选型报价、采购、进出口和到货验收模板' },
  { code: '04_construction', name: '施工与调试', description: '现场施工、安全交底、调试记录和问题闭环模板' },
  { code: '05_acceptance', name: '验收与移交', description: '验收清单、交付确认、培训和资料移交模板' },
  { code: '06_review', name: '复盘与归档', description: '项目复盘、经验沉淀和归档检查模板' },
  { code: 'unassigned', name: '未归类模板', description: '尚未绑定交付流程阶段的模板' },
]

const statusOptions = [
  { value: 'Draft', label: '草稿' },
  { value: 'Published', label: '已发布' },
  { value: 'Deprecated', label: '已废弃' },
]

function normalizeStageCode(stageCode?: string | null): string {
  return stageCode || 'unassigned'
}

const templateSections = computed<TemplateSection[]>(() =>
  stages.map((stage) => ({
    stage,
    templates: templateList.value.filter(
      (template) => normalizeStageCode(template.stageCode) === stage.code,
    ),
  })),
)

const activeSection = computed(() =>
  templateSections.value.find((section) => section.stage.code === activeStageCode.value)
  || templateSections.value.find((section) => section.templates.length)
  || templateSections.value[0],
)

function columnsFor(stageName: string): TableColumnData[] {
  return [
    { title: stageName, dataIndex: 'name', slotName: 'name', minWidth: 420 },
    { title: '编号', dataIndex: 'templateNo', slotName: 'templateNo', width: 190 },
    { title: '分类', dataIndex: 'category', width: 96 },
    { title: '格式', dataIndex: 'fileFormat', slotName: 'format', width: 74 },
    { title: '状态', dataIndex: 'status', slotName: 'status', width: 90 },
    { title: '发布时间', dataIndex: 'publishedAt', slotName: 'publishedAt', width: 136 },
    { title: '操作', slotName: 'actions', width: 230, fixed: 'right' },
  ]
}

async function fetchList(): Promise<void> {
  loading.value = true
  try {
    const params: QueryTemplateDto = { page: 1, pageSize: 300 }
    const res = await templateApi.getList(params)
    const data = res as PaginatedData<DocumentTemplate>
    templateList.value = data.list
    if (!activeStageCode.value) {
      activeStageCode.value = templateSections.value.find((section) => section.templates.length)?.stage.code
        || stages[0].code
    }
    await nextTick()
    updateActiveStageByScroll()
  } catch {
    templateList.value = []
  } finally {
    loading.value = false
  }
}

async function scrollToStage(stageCode: string): Promise<void> {
  activeStageCode.value = stageCode
  await nextTick()
  const container = templateStreamRef.value
  const target = document.getElementById(`template-stage-${stageCode}`)
  if (container && target) {
    container.scrollTo({ top: target.offsetTop, behavior: 'smooth' })
    return
  }
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function updateActiveStageByScroll(): void {
  const container = templateStreamRef.value
  if (!container || !templateSections.value.length) return

  const containerTop = container.getBoundingClientRect().top
  const threshold = 56
  let currentCode = templateSections.value[0].stage.code

  for (const section of templateSections.value) {
    const element = document.getElementById(`template-stage-${section.stage.code}`)
    if (!element) continue
    const top = element.getBoundingClientRect().top - containerTop
    if (top <= threshold) {
      currentCode = section.stage.code
    } else {
      break
    }
  }

  activeStageCode.value = currentCode
}

function handleCreate(): void {
  router.push('/template/create')
}

function handleEdit(row: DocumentTemplate): void {
  router.push(`/template/${row.id}`)
}

async function handleDelete(row: DocumentTemplate): Promise<void> {
  try {
    await arcoConfirm(`确定删除模板"${row.name}"吗？`, '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await templateApi.delete(row.id)
    Message.success('删除成功')
    await fetchList()
  } catch {
    // cancelled
  }
}

async function handlePublish(row: DocumentTemplate): Promise<void> {
  try {
    await templateApi.publish(row.id)
    Message.success('发布成功')
    await fetchList()
  } catch {
    // error handled by request interceptor
  }
}

async function handleDownload(row: DocumentTemplate): Promise<void> {
  try {
    const download = await templateApi.getDownloadInfo(row.id)
    const content = download.attachmentId
      ? await attachmentApi.getContent(download.attachmentId)
      : new Blob([download.generatedContent || ''], {
          type: 'text/markdown;charset=utf-8',
        })
    downloadBlob(content, download.fileName)
  } catch {
    Message.warning('该模板尚未上传可下载文件')
  }
}

function statusTagType(status: string): TagType {
  const map: Record<string, TagType> = {
    Draft: 'info',
    Published: 'success',
    Deprecated: 'danger',
  }
  return map[status] || 'info'
}

function statusLabel(status: string): string {
  return statusOptions.find((option) => option.value === status)?.label || status
}

function formatDate(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN')
}

onMounted(fetchList)
</script>

<template>
  <section class="template-page">
    <aside class="template-sidebar">
      <div class="template-sidebar-header">
        <h2>交付流程</h2>
        <a-button size="small" type="text" @click="fetchList">刷新</a-button>
      </div>

      <div class="stage-list">
        <button
          v-for="section in templateSections"
          :key="section.stage.code"
          class="stage-item"
          :class="{ active: section.stage.code === activeStageCode }"
          type="button"
          @click="scrollToStage(section.stage.code)"
        >
          <span>{{ section.stage.name }}</span>
          <em>{{ section.templates.length }}</em>
        </button>
      </div>
    </aside>

    <main class="template-panel">
      <div class="template-toolbar">
        <div class="toolbar-title">
          <strong>{{ activeSection?.stage.name || '文档模板' }}</strong>
          <span>{{ activeSection?.templates.length || 0 }} 个模板</span>
        </div>
        <a-button size="small" type="primary" @click="handleCreate">新增模板</a-button>
      </div>

      <a-spin :loading="loading" class="template-spin">
        <div
          ref="templateStreamRef"
          class="template-stream"
          @scroll.passive="updateActiveStageByScroll"
        >
          <section
            v-for="section in templateSections"
            :id="`template-stage-${section.stage.code}`"
            :key="section.stage.code"
            class="template-section"
          >
            <a-table
              v-if="section.templates.length"
              :columns="columnsFor(section.stage.name)"
              :data="section.templates"
              :pagination="false"
              :bordered="{ cell: false }"
              row-key="id"
              class="template-table"
            >
              <template #name="{ record }">
                <div class="template-name-cell">
                  <strong>{{ record.name }}</strong>
                  <span>{{ section.stage.description }}</span>
                </div>
              </template>
              <template #templateNo="{ record }">
                <code>{{ record.templateNo }}</code>
              </template>
              <template #format="{ record }">
                <a-tag size="small">{{ (record.fileFormat || '-').toUpperCase() }}</a-tag>
              </template>
              <template #status="{ record }">
                <a-tag :type="statusTagType(record.status)" size="small">
                  {{ statusLabel(record.status) }}
                </a-tag>
              </template>
              <template #publishedAt="{ record }">
                {{ formatDate(record.publishedAt) }}
              </template>
              <template #actions="{ record }">
                <a-space size="mini" :wrap="false" class="template-actions">
                  <a-button
                    v-if="record.status === 'Published'"
                    type="text"
                    size="mini"
                    @click="handleDownload(record)"
                  >
                    下载
                  </a-button>
                  <a-button type="text" size="mini" @click="handleEdit(record)">
                    编辑
                  </a-button>
                  <a-button
                    v-if="record.status === 'Draft'"
                    type="text"
                    status="success"
                    size="mini"
                    @click="handlePublish(record)"
                  >
                    发布
                  </a-button>
                  <a-button
                    type="text"
                    status="danger"
                    size="mini"
                    @click="handleDelete(record)"
                  >
                    删除
                  </a-button>
                </a-space>
              </template>
            </a-table>

            <a-empty v-else description="暂无模板" class="template-empty" />
          </section>
        </div>
      </a-spin>
    </main>
  </section>
</template>

<style scoped lang="scss">
.template-page {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  gap: 6px;
  overflow: hidden;
}

.template-sidebar,
.template-panel {
  min-width: 0;
  min-height: 0;
  height: 100%;
  border: 1px solid var(--color-border-2);
  border-radius: 0;
  background: var(--color-bg-2);
}

.template-sidebar {
  display: flex;
  flex-direction: column;
  padding: 6px;
  overflow: hidden;
}

.template-sidebar-header {
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 7px;
  padding: 0 2px;

  h2 {
    margin: 0;
    color: var(--color-text-1);
    font-size: 15px;
    font-weight: 650;
  }
}

.stage-list {
  display: grid;
  align-content: start;
  gap: 3px;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.stage-item {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 5px;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--color-text-2);
  cursor: pointer;
  font-size: 12px;
  text-align: left;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  em {
    min-width: 22px;
    padding: 0 5px;
    color: var(--color-text-3);
    font-size: 11px;
    font-style: normal;
    text-align: center;
  }

  &.active,
  &:hover {
    border-color: rgb(var(--primary-5));
    background: rgb(var(--primary-1));
    color: rgb(var(--primary-6));
  }
}

.template-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.template-toolbar {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border-2);
  background: #fff;
}

.toolbar-title {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;

  strong {
    overflow: hidden;
    color: var(--color-text-1);
    font-size: 15px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    flex: 0 0 auto;
    color: var(--color-text-3);
    font-size: 12px;
  }
}

.template-spin {
  min-height: 0;
  display: block;
  flex: 1;
}

.template-spin :deep(.arco-spin-children) {
  height: 100%;
  min-height: 0;
}

.template-stream {
  height: 100%;
  padding: 8px 8px 10px;
  overflow-y: auto;
  overflow-x: hidden;
}

.template-section {
  margin-bottom: 10px;
  scroll-margin-top: 8px;
}

.template-table {
  border: 1px solid var(--color-border-2);
  border-radius: 0;
  overflow: hidden;
}

.template-table :deep(.arco-table-th) {
  font-size: 12px;
}

.template-table :deep(.arco-table-cell) {
  padding: 7px 8px;
  font-size: 12px;
  line-height: 1.42;
}

.template-name-cell {
  min-width: 0;
  display: grid;
  gap: 2px;

  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    overflow: hidden;
    color: var(--color-text-3);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.template-actions {
  white-space: nowrap;
}

.template-actions :deep(.arco-btn-size-mini) {
  padding: 0 4px;
  font-size: 11px;
}

.template-empty {
  padding: 20px 0;
  border: 1px dashed var(--color-border-2);
  border-radius: 0;
  background: var(--color-fill-1);
}

@media (max-width: 980px) {
  .template-page {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(104px, 172px) minmax(0, 1fr);
  }

  .stage-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
