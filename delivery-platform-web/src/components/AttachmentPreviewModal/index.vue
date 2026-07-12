<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'

const FilePreviewRouter = defineAsyncComponent(
  () => import('@/components/FilePreviewRouter/index.vue'),
)

const { t } = useI18n()
const props = defineProps<{
  visible: boolean
  resourceId?: string
  title?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const modalTitle = computed(() => props.title || t('filePreview.onlinePreview'))
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
      v-if="props.visible"
      :file-id="props.resourceId"
      height="calc(100vh - 76px)"
      compact
    />
  </a-modal>
</template>
