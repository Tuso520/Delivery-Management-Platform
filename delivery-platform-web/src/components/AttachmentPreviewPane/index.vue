<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { attachmentApi } from '@/api/attachment'
import type { AttachmentPreview } from '@/api/attachment'

const props = withDefaults(defineProps<{
  attachmentId?: string
  height?: string
  compact?: boolean
}>(), {
  height: '72vh',
  compact: false,
})

const loading = ref(false)
const preview = ref<AttachmentPreview>()
const objectUrl = ref('')

const isMarkdown = computed(() => (preview.value?.fileExt || '').toLowerCase() === 'md')
const paneStyle = computed(() => ({ '--preview-pane-height': props.height }))

function revokeObjectUrl(): void {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = ''
  }
}

async function loadPreview(): Promise<void> {
  revokeObjectUrl()
  preview.value = undefined
  if (!props.attachmentId) return

  loading.value = true
  try {
    const nextPreview = await attachmentApi.getPreview(props.attachmentId)
    preview.value = nextPreview

    if (nextPreview.previewKind === 'image' || nextPreview.previewKind === 'pdf') {
      const blob = await attachmentApi.getContent(props.attachmentId)
      objectUrl.value = URL.createObjectURL(blob)
    }
  } catch {
    Message.error('预览内容加载失败')
  } finally {
    loading.value = false
  }
}

watch(() => props.attachmentId, loadPreview, { immediate: true })
onBeforeUnmount(revokeObjectUrl)
</script>

<template>
  <a-spin :loading="loading" class="attachment-preview-pane" :style="paneStyle">
    <div v-if="preview" class="preview-surface" :class="{ compact: props.compact }">
      <img
        v-if="preview.previewKind === 'image' && objectUrl"
        class="preview-image"
        :src="objectUrl"
        :alt="preview.title || preview.fileName"
      />

      <iframe
        v-else-if="preview.previewKind === 'pdf' && objectUrl"
        class="preview-native-frame"
        :src="`${objectUrl}#toolbar=1&navpanes=0&view=FitH`"
        :title="preview.title || preview.fileName"
      />

      <MdPreview
        v-else-if="preview.previewKind === 'text' && isMarkdown"
        :model-value="preview.text || ''"
        language="zh-CN"
        class="markdown-preview"
      />

      <pre v-else-if="preview.previewKind === 'text'" class="preview-text">
{{ preview.text || '' }}
      </pre>

      <div
        v-else-if="preview.previewKind === 'html' || preview.previewKind === 'pdf'"
        class="preview-html"
        v-html="preview.html || ''"
      />

      <a-empty
        v-else
        :description="preview.reason || '当前文件暂不支持在线预览，请下载后查看。'"
        class="preview-empty"
      />
    </div>
    <a-empty v-else-if="!loading" description="请选择需要预览的文件" class="preview-empty" />
  </a-spin>
</template>

<style scoped lang="scss">
.attachment-preview-pane {
  height: var(--preview-pane-height);
  min-height: 360px;
  display: block;
  background: #f2f4f8;
}

.attachment-preview-pane :deep(.arco-spin-children) {
  height: 100%;
  min-height: 0;
}

.preview-surface {
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 16px;

  &.compact {
    padding: 10px;
  }
}

.preview-image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  margin: 0 auto;
  border: 1px solid var(--color-border-2);
  background: #fff;
  object-fit: contain;
}

.preview-native-frame {
  width: 100%;
  height: 100%;
  min-height: 560px;
  border: 1px solid var(--color-border-2);
  background: #fff;
}

.preview-text,
.markdown-preview,
.preview-html {
  width: min(1240px, 100%);
  min-height: 100%;
  margin: 0 auto;
  background: transparent;
}

.markdown-preview {
  padding: 22px 28px;
  border: 1px solid var(--color-border-2);
  background: #fff;
}

.preview-text {
  padding: 22px 28px;
  border: 1px solid var(--color-border-2);
  color: var(--color-text-1);
  font-family: Consolas, "SFMono-Regular", monospace;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.preview-html :deep(.attachment-preview > header) {
  display: none;
}

.preview-html :deep(.attachment-preview) {
  margin: 0;
}

.preview-html :deep(.office-word) {
  display: flex;
  justify-content: center;
  padding: 10px 0 26px;
}

.preview-html :deep(.word-page) {
  width: min(900px, 100%);
  min-height: 1120px;
  padding: 72px 82px;
  border: 1px solid #d9dfe8;
  background: #fff;
  box-shadow: 0 16px 42px rgba(15, 23, 42, 0.12);
}

.preview-html :deep(.word-page-meta) {
  margin-bottom: 18px;
  color: #86909c;
  font-size: 12px;
}

.preview-html :deep(.word-body h1) {
  margin: 0 0 28px;
  color: #1d2129;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}

.preview-html :deep(.word-body p) {
  margin: 0 0 12px;
  color: #1d2129;
  font-size: 15px;
  line-height: 1.9;
  text-indent: 2em;
  white-space: pre-wrap;
}

.preview-html :deep(.office-excel) {
  min-width: 100%;
  min-height: 100%;
  border: 1px solid #d9dfe8;
  background: #f7f9fc;
}

.preview-html :deep(.excel-workbook) {
  min-width: 980px;
}

.preview-html :deep(.preview-sheet) {
  margin: 0;
  padding: 0 0 30px;
  background: #fff;
}

.preview-html :deep(.preview-sheet h3) {
  position: sticky;
  top: 0;
  z-index: 2;
  margin: 0;
  padding: 9px 12px;
  border-bottom: 1px solid #d9dfe8;
  background: #f2f5f9;
  color: #1d2129;
  font-size: 13px;
  font-weight: 650;
}

.preview-html :deep(.preview-table-wrap) {
  width: 100%;
  max-height: 58vh;
  overflow: auto;
  resize: both;
  padding: 10px;
  background: #fff;
}

.preview-html :deep(table) {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  table-layout: auto;
  font-size: 13px;
  background: #fff;
}

.preview-html :deep(td),
.preview-html :deep(th) {
  min-width: 118px;
  max-width: 360px;
  height: 34px;
  padding: 7px 9px;
  border: 1px solid #d9dfe8;
  vertical-align: top;
  overflow: auto;
  resize: both;
  word-break: break-word;
}

.preview-html :deep(tr:first-child td),
.preview-html :deep(tr:first-child th) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #edf3ff;
  color: #1d2129;
  font-weight: 650;
}

.preview-html :deep(.office-presentation) {
  display: grid;
  gap: 16px;
}

.preview-html :deep(.preview-slide) {
  aspect-ratio: 16 / 9;
  max-width: 960px;
  margin: 0 auto 18px;
  padding: 48px 56px;
  border: 1px solid #d9dfe8;
  background: #fff;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.12);
}

.preview-empty {
  height: 100%;
  display: grid;
  place-content: center;
}

@media (max-width: 900px) {
  .preview-surface {
    padding: 10px;
  }

  .preview-html :deep(.word-page) {
    min-height: auto;
    padding: 36px 24px;
  }
}
</style>
