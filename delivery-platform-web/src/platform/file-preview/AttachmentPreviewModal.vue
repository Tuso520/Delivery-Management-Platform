<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PreviewContentType } from './useFilePreview'
import { renderSafeMarkdown } from '@/utils/markdown-preview'

const FilePreviewRouter = defineAsyncComponent(
  () => import('@/platform/file-preview/FilePreviewRouter.vue'),
)

const { t } = useI18n()
const props = defineProps<{
  visible: boolean
  resourceId?: string
  contentType?: PreviewContentType
  markdownContent?: string
  title?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const modalTitle = computed(() => props.title || t('filePreview.onlinePreview'))
const markdownHtml = computed(() => renderSafeMarkdown(props.markdownContent ?? '').html)
</script>

<template>
  <a-modal
    :visible="props.visible"
    :title="modalTitle"
    :width="'calc(100vw - 24px)'"
    :top="12"
    :align-center="false"
    :body-style="{ padding: 0 }"
    :footer="false"
    :mask-closable="false"
    :unmount-on-close="true"
    class="attachment-preview-modal"
    @update:visible="emit('update:visible', $event)"
    @cancel="emit('update:visible', false)"
  >
    <FilePreviewRouter
      v-if="props.visible && props.contentType !== 'MARKDOWN'"
      :file-id="props.resourceId"
      height="calc(100vh - 76px)"
      compact
    />
    <!-- eslint-disable vue/no-v-html -- renderSafeMarkdown escapes and allowlists generated markup. -->
    <article
      v-else-if="props.visible"
      class="attachment-preview-modal__markdown markdown-body"
      v-html="markdownHtml"
    />
    <!-- eslint-enable vue/no-v-html -->
  </a-modal>
</template>

<style scoped lang="scss">
.attachment-preview-modal__markdown {
  height: calc(100vh - 76px);
  padding: 24px 32px;
  overflow: auto;
  color: #1d2129;
  background: #fff;
  box-sizing: border-box;
  line-height: 1.75;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 1.2em 0 0.6em;
  line-height: 1.35;
}

.markdown-body :deep(h1) {
  font-size: 28px;
}

.markdown-body :deep(h2) {
  font-size: 22px;
}

.markdown-body :deep(p) {
  margin: 0 0 1em;
}

.markdown-body :deep(pre) {
  padding: 14px;
  overflow: auto;
  border-radius: 4px;
  background: #f2f3f5;
}

.markdown-body :deep(code) {
  font-family: Consolas, 'SFMono-Regular', monospace;
}

.markdown-body :deep(.md-table-wrap) {
  overflow-x: auto;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 8px 12px;
  border: 1px solid #e5e6eb;
}
</style>
