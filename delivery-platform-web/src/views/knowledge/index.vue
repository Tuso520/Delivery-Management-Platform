<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Message, Modal } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { knowledgeApi } from '@/api/knowledge'
import type {
  KnowledgeArticle,
  KnowledgeCategory,
  QueryKnowledgeArticleDto,
} from '@/types/knowledge'

const router = useRouter()
const loading = ref(false)
const categories = ref<KnowledgeCategory[]>([])
const articles = ref<KnowledgeArticle[]>([])
const activeCategoryId = ref('')
const keyword = ref('')
const status = ref('')
const sourceStatus = ref('')

interface CategoryIndexItem {
  category: KnowledgeCategory
  label: string
  articles: KnowledgeArticle[]
  fileCount: number
}

const statusOptions = [
  { label: '草稿', value: 'Draft', color: 'gray' },
  { label: '审核中', value: 'Reviewing', color: 'blue' },
  { label: '已发布', value: 'Published', color: 'green' },
  { label: '已废弃', value: 'Deprecated', color: 'red' },
  { label: '已归档', value: 'Archived', color: 'gray' },
] as const

const sourceOptions = [
  { label: '资料齐全', value: 'Ready', color: 'green' },
  { label: '待上传', value: 'PendingUpload', color: 'orange' },
] as const

const articleColumns: TableColumnData[] = [
  { title: '主要内容', dataIndex: 'title', slotName: 'title', width: 300 },
  { title: '国家', dataIndex: 'countryCode', slotName: 'country', width: 100 },
  { title: '适用阶段', dataIndex: 'stageCode', slotName: 'stage', width: 140 },
  { title: '资料状态', dataIndex: 'sourceStatus', slotName: 'sourceStatus', width: 120 },
  { title: '发布状态', dataIndex: 'status', slotName: 'status', width: 120 },
  { title: '版本', dataIndex: 'version', width: 90 },
  { title: '文件', slotName: 'content', width: 130 },
  { title: '操作', slotName: 'actions', width: 210, fixed: 'right' },
]

const rootCategories = computed(() => categories.value.filter((category) => !category.parentId))

const categoryRootLookup = computed(() => {
  const lookup = new Map<string, string>()
  const visit = (category: KnowledgeCategory, rootId: string) => {
    lookup.set(category.id, rootId)
    ;(category.children || []).forEach((child) => visit(child, rootId))
  }
  rootCategories.value.forEach((category) => visit(category, category.id))
  return lookup
})

const categorySections = computed<CategoryIndexItem[]>(() =>
  rootCategories.value
    .map((category) => {
      const sectionArticles = articles.value.filter(
        (article) => (categoryRootLookup.value.get(article.categoryId) || article.categoryId) === category.id,
      )
      return {
        category,
        label: category.name,
        articles: sectionArticles,
        fileCount: sectionArticles.reduce((total, article) => total + articleFileCount(article), 0),
      }
    })
    .filter((section) => section.articles.length),
)

function articleFileCount(article: KnowledgeArticle): number {
  return Number(article.fileCount ?? (article.fileUrl ? 1 : 0))
}

function articleTopic(article: KnowledgeArticle, rootName: string): string {
  const prefix = `${rootName} - `
  return article.title.startsWith(prefix) ? article.title.slice(prefix.length) : article.title
}

function statusMeta(value: string) {
  return statusOptions.find((item) => item.value === value)
}

function sourceMeta(value: string) {
  return sourceOptions.find((item) => item.value === value)
}

async function fetchCategories(): Promise<void> {
  categories.value = await knowledgeApi.getCategories()
}

async function fetchArticles(): Promise<void> {
  loading.value = true
  try {
    const params: QueryKnowledgeArticleDto = {
      page: 1,
      pageSize: 200,
      keyword: keyword.value || undefined,
      status: status.value || undefined,
      sourceStatus: sourceStatus.value || undefined,
    }
    articles.value = (await knowledgeApi.getArticles(params)).list
  } finally {
    loading.value = false
  }
}

async function scrollToCategory(categoryId: string): Promise<void> {
  activeCategoryId.value = categoryId
  await nextTick()
  document.getElementById(`knowledge-${categoryId}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

async function publish(article: KnowledgeArticle): Promise<void> {
  await knowledgeApi.publishArticle(article.id)
  Message.success('知识条目已提交发布审核')
  await fetchArticles()
}

function remove(article: KnowledgeArticle): void {
  Modal.warning({
    title: '删除知识条目',
    content: `确认删除“${article.title}”？`,
    okText: '删除',
    cancelText: '取消',
    hideCancel: false,
    async onOk() {
      await knowledgeApi.deleteArticle(article.id)
      Message.success('已移入删除状态')
      await fetchArticles()
    },
  })
}

onMounted(async () => {
  await fetchCategories()
  await fetchArticles()
  activeCategoryId.value = categorySections.value[0]?.category.id || ''
})
</script>

<template>
  <div class="knowledge-layout arco-surface">
    <aside class="category-index">
      <div class="index-title">知识分类</div>
      <a-button
        v-for="section in categorySections"
        :key="section.category.id"
        class="category-link"
        :class="{ active: activeCategoryId === section.category.id }"
        type="text"
        long
        @click="scrollToCategory(section.category.id)"
      >
        <span>{{ section.label }}</span>
        <span class="file-count-pill">{{ section.fileCount }}</span>
      </a-button>
    </aside>

    <main class="knowledge-stream">
      <div class="knowledge-toolbar">
        <div class="filters">
          <a-input-search
            v-model="keyword"
            allow-clear
            search-button
            placeholder="搜索知识标题或正文"
            class="filter-control-wide"
            @search="fetchArticles"
            @press-enter="fetchArticles"
          />
          <a-select v-model="status" allow-clear placeholder="发布状态" class="filter-control">
            <a-option
              v-for="item in statusOptions"
              :key="item.value"
              :value="item.value"
            >
              {{ item.label }}
            </a-option>
          </a-select>
          <a-select
            v-model="sourceStatus"
            allow-clear
            placeholder="资料状态"
            class="filter-control"
          >
            <a-option
              v-for="item in sourceOptions"
              :key="item.value"
              :value="item.value"
            >
              {{ item.label }}
            </a-option>
          </a-select>
          <a-button @click="fetchArticles">查询</a-button>
        </div>
        <a-button type="primary" @click="router.push('/knowledge/create')">
          <template #icon><icon-plus /></template>
          创建知识
        </a-button>
      </div>

      <a-spin :loading="loading" class="stream-sections">
        <section
          v-for="section in categorySections"
          :id="`knowledge-${section.category.id}`"
          :key="section.category.id"
          class="category-section"
          @mouseenter="activeCategoryId = section.category.id"
        >
          <header class="category-header">
            <div>
              <h3>{{ section.label }}</h3>
              <p>{{ section.category.description }}</p>
            </div>
            <span class="section-file-count">{{ section.fileCount }} 个文件</span>
          </header>

          <a-table
            v-if="section.articles.length"
            :columns="articleColumns"
            :data="section.articles"
            :pagination="false"
            :bordered="{ cell: true }"
            row-key="id"
            class="knowledge-table"
          >
            <template #title="{ record }">
              <div class="article-topic">
                <a-button type="text" @click="router.push(`/knowledge/${record.id}`)">
                  {{ articleTopic(record, section.category.name) }}
                </a-button>
                <span v-if="articleTopic(record, section.category.name) !== record.title" class="topic-note">
                  {{ record.title }}
                </span>
              </div>
            </template>
            <template #country="{ record }">
              {{ record.countryCode || '通用' }}
            </template>
            <template #stage="{ record }">
              {{ record.stageCode || '全阶段' }}
            </template>
            <template #sourceStatus="{ record }">
              <a-tag :color="sourceMeta(record.sourceStatus)?.color">
                {{ sourceMeta(record.sourceStatus)?.label || record.sourceStatus }}
              </a-tag>
            </template>
            <template #status="{ record }">
              <a-tag :color="statusMeta(record.status)?.color">
                {{ statusMeta(record.status)?.label || record.status }}
              </a-tag>
            </template>
            <template #content="{ record }">
              <span class="table-file-count">{{ articleFileCount(record) }} 个文件</span>
            </template>
            <template #actions="{ record }">
              <a-space size="mini">
                <a-button type="text" @click="router.push(`/knowledge/${record.id}?edit=1`)">
                  编辑
                </a-button>
                <a-button
                  v-if="!['Published', 'Reviewing'].includes(record.status)"
                  type="text"
                  status="success"
                  @click="publish(record)"
                >
                  发布
                </a-button>
                <a-button type="text" status="danger" @click="remove(record)">
                  删除
                </a-button>
              </a-space>
            </template>
          </a-table>
          <a-empty
            v-else
            :description="`${section.label}暂无匹配内容`"
          />
        </section>
      </a-spin>
    </main>
  </div>
</template>

<style scoped lang="scss">
.knowledge-layout {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  gap: 16px;
}

.category-index {
  position: sticky;
  top: 0;
  align-self: start;
  max-height: calc(100dvh - 110px);
  padding: 12px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-bg-2);
  overflow-y: auto;
}

.index-title {
  padding: 6px 10px 10px;
  color: var(--color-text-1);
  font-weight: 650;
}

.category-link {
  justify-content: space-between;
  min-height: 38px;
  margin-bottom: 4px;
  color: var(--color-text-2);

  span:first-child {
    min-width: 0;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &.active,
  &:hover {
    background: rgb(var(--primary-1));
    color: rgb(var(--primary-6));
  }
}

.file-count-pill {
  flex: 0 0 auto;
  min-width: 26px;
  padding: 1px 7px;
  border: 1px solid var(--color-border-2);
  border-radius: 999px;
  background: var(--color-fill-1);
  color: var(--color-text-3);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  text-align: center;
}

.knowledge-stream {
  min-width: 0;
}

.knowledge-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.filter-control {
  width: 180px;
}

.filter-control-wide {
  width: min(340px, 42vw);
}

.stream-sections {
  display: block;
}

.stream-sections :deep(.arco-spin-children) {
  display: grid;
  gap: 18px;
}

.category-section {
  scroll-margin-top: 16px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-bg-2);
  overflow: hidden;
}

.category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--color-border-2);

  h3 {
    margin: 0;
    color: var(--color-text-1);
    font-size: 16px;
  }

  p,
  span {
    margin: 3px 0 0;
    color: var(--color-text-3);
    font-size: 12px;
  }
}

.section-file-count {
  flex: 0 0 auto;
}

.article-topic {
  display: grid;
  gap: 2px;
  justify-items: start;
  min-width: 0;
}

.article-topic :deep(.arco-btn) {
  max-width: 100%;
  padding-right: 0;
  padding-left: 0;
}

.topic-note {
  max-width: 100%;
  overflow: hidden;
  color: var(--color-text-3);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-file-count {
  color: var(--color-text-2);
  font-size: 13px;
}

.knowledge-table :deep(.arco-btn-text) {
  padding-right: 4px;
  padding-left: 4px;
}

@media (max-width: 900px) {
  .knowledge-layout {
    grid-template-columns: 1fr;
  }

  .category-index {
    position: static;
    max-height: none;
  }

  .knowledge-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .filter-control,
  .filter-control-wide {
    width: 100%;
  }
}
</style>
