<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'

const AttachmentPreviewPane = defineAsyncComponent(() =>
  import('@/components/AttachmentPreviewPane/index.vue'),
)

const props = withDefaults(defineProps<{
  visible: boolean
  attachmentId?: string
  source?: 'attachment' | 'file'
  title?: string
}>(), {
  source: 'attachment',
  title: '在线预览',
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const modalTitle = computed(() => props.title || '在线预览')
</script>

<template>
  <a-modal
    :visible="props.visible"
    :title="modalTitle"
    :width="'94vw'"
    :footer="false"
    :mask-closable="false"
    class="attachment-preview-modal"
    @update:visible="emit('update:visible', $event)"
    @cancel="emit('update:visible', false)"
  >
    <AttachmentPreviewPane
      v-if="props.visible"
      :attachment-id="props.attachmentId"
      :source="props.source"
      height="78vh"
    />
  </a-modal>
</template>

<style scoped lang="scss">
.attachment-preview-modal :deep(.arco-modal-body) {
  padding: 0;
}

.attachment-preview-modal :deep(.arco-modal-header) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border-2);
}
</style>
