<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { IconLeft } from '@arco-design/web-vue/es/icon'

import { useKnowledgeDetailQuery } from '@/domains/knowledge/queries/useKnowledgeQueries'
import {
  knowledgeMaterialName,
  selectKnowledgeDisplayVersion,
} from '@/domains/knowledge/utils/knowledge-display'
import { firstRouteParam } from '@/router/query-state'
import { renderSafeMarkdown } from '@/utils/markdown-preview'

const FilePreviewRouter = defineAsyncComponent(
  () => import('@/platform/file-preview/FilePreviewRouter.vue'),
)

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const itemId = computed(() => firstRouteParam(route.params.id))
const detailQuery = useKnowledgeDetailQuery(itemId)
const detail = computed(() => detailQuery.data.value ?? null)
const version = computed(() => (detail.value ? selectKnowledgeDisplayVersion(detail.value) : null))
const materialName = computed(() =>
  detail.value ? knowledgeMaterialName(detail.value) : t('knowledge.defaultFileName'),
)
const logicalFileId = computed(() => version.value?.fileVersion?.logicalFileId ?? '')
const markdownHtml = computed(() => renderSafeMarkdown(version.value?.markdownContent ?? '').html)

function goBack(): void {
  void router.push({ name: 'Knowledge', query: route.query })
}
</script>

<template>
  <section class="knowledge-reader">
    <header class="knowledge-reader__header">
      <a-button type="text" class="knowledge-reader__back" @click="goBack">
        <template #icon>
          <IconLeft />
        </template>
        {{ t('knowledge.reader.back') }}
      </a-button>
      <div class="knowledge-reader__title">
        <strong :title="materialName">{{ materialName }}</strong>
        <span>{{ version?.version || '-' }}</span>
      </div>
    </header>

    <main class="knowledge-reader__content">
      <a-spin v-if="detailQuery.isFetching.value" class="knowledge-reader__state" />
      <a-result
        v-else-if="detailQuery.isError.value"
        status="error"
        :title="t('knowledge.reader.loadFailed')"
      >
        <template #extra>
          <a-button type="primary" @click="detailQuery.refetch()">
            {{ t('knowledge.retry') }}
          </a-button>
        </template>
      </a-result>
      <FilePreviewRouter
        v-else-if="version?.contentType === 'FILE' && logicalFileId"
        :file-id="logicalFileId"
        height="100%"
      />
      <!-- eslint-disable vue/no-v-html -- renderSafeMarkdown escapes and allowlists generated markup. -->
      <article
        v-else-if="version?.contentType === 'MARKDOWN'"
        class="knowledge-reader__markdown"
        v-html="markdownHtml"
      />
      <!-- eslint-enable vue/no-v-html -->
      <a-result v-else status="warning" :title="t('knowledge.reader.unavailable')" />
    </main>
  </section>
</template>

<style scoped lang="scss">
.knowledge-reader {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
}

.knowledge-reader__header {
  height: 52px;
  display: flex;
  flex: 0 0 52px;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid #e5e6eb;
  box-sizing: border-box;
}

.knowledge-reader__back {
  flex: 0 0 auto;
}

.knowledge-reader__title {
  min-width: 0;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 12px;

  strong {
    min-width: 0;
    overflow: hidden;
    color: #1d2129;
    font-size: 15px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    flex: 0 0 auto;
    color: #86909c;
    font-size: 12px;
  }
}

.knowledge-reader__content {
  min-height: 0;
  position: relative;
  flex: 1 1 0;
  overflow: hidden;
}

.knowledge-reader__state {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
}

.knowledge-reader__markdown {
  height: 100%;
  margin: 0;
  padding: 24px clamp(24px, 6vw, 96px) 48px;
  overflow: auto;
  color: #1d2129;
  font-size: 14px;
  line-height: 1.75;
  box-sizing: border-box;

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    margin: 1.4em 0 0.65em;
    line-height: 1.35;
  }

  :deep(p),
  :deep(ul),
  :deep(ol),
  :deep(blockquote),
  :deep(pre) {
    margin: 0 0 1em;
  }

  :deep(pre) {
    padding: 16px;
    overflow: auto;
    border-radius: 4px;
    background: #f7f8fa;
  }

  :deep(.md-table-wrap) {
    overflow-x: auto;
  }

  :deep(table) {
    width: 100%;
    border-collapse: collapse;
  }

  :deep(th),
  :deep(td) {
    padding: 8px 12px;
    border: 1px solid #e5e6eb;
    text-align: left;
  }
}
</style>
