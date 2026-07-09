<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'

const AttachmentPreviewPane = defineAsyncComponent(
  () => import('@/components/AttachmentPreviewPane/index.vue'),
)
const FilePreviewRouter = defineAsyncComponent(
  () => import('@/components/FilePreviewRouter/index.vue'),
)

const props = withDefaults(
  defineProps<{
    visible: boolean
    resourceId?: string
    source?: 'attachment' | 'file'
    title?: string
  }>(),
  {
    source: 'attachment',
    title: '在线预览',
  },
)

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const modalTitle = computed(() => props.title || '在线预览')
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
      v-if="props.visible && props.source === 'file'"
      :file-id="props.resourceId"
      height="calc(100vh - 76px)"
      compact
    />
    <AttachmentPreviewPane
      v-else-if="props.visible"
      :attachment-id="props.resourceId"
      :source="props.source"
      height="calc(100vh - 76px)"
      compact
    />
  </a-modal>
</template>
