<script setup lang="ts">
import { computed } from 'vue'
import AttachmentPreviewPane from '@/components/AttachmentPreviewPane/index.vue'

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
    :width="'92vw'"
    :footer="false"
    class="attachment-preview-modal"
    @update:visible="emit('update:visible', $event)"
    @cancel="emit('update:visible', false)"
  >
    <AttachmentPreviewPane
      v-if="props.visible"
      :attachment-id="props.attachmentId"
      :source="props.source"
      height="76vh"
    />
  </a-modal>
</template>

<style scoped lang="scss">
.attachment-preview-modal :deep(.arco-modal-body) {
  padding: 0;
}
</style>
