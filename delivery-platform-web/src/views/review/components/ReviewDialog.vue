<script setup lang="ts">
import { ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { reviewApi } from '@/api/review'

const props = defineProps<{
  visible: boolean
  fileId: string
  fileName: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'review-complete'): void
}>()

const decision = ref<'Approved' | 'Rejected'>('Approved')
const comment = ref('')
const submitting = ref(false)

async function handleSubmit() {
  if (!comment.value.trim()) {
    Message.warning('请输入审核意见')
    return
  }

  submitting.value = true
  try {
    if (decision.value === 'Approved') {
      await reviewApi.approve(props.fileId, comment.value)
    } else {
      await reviewApi.reject(props.fileId, comment.value)
    }
    Message.success(
      decision.value === 'Approved' ? '审核已通过' : '审核已驳回',
    )
    emit('review-complete')
  } catch {
    // Error handled by interceptor
  } finally {
    submitting.value = false
  }
}

function handleClose() {
  emit('update:visible', false)
}
</script>

<template>
  <a-dialog
    :model-value="props.visible"
    title="文件审核"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
    @closed="handleClose"
  >
    <div class="review-dialog-content">
      <a-descriptions :column="1" border size="small">
        <a-descriptions-item label="文件名">
          {{ props.fileName }}
        </a-descriptions-item>
      </a-descriptions>

      <a-divider />

      <a-form :model="{}" label-width="100px">
        <a-form-item label="审核结果">
          <a-radio-group v-model="decision">
            <a-radio value="Approved">
              通过
            </a-radio>
            <a-radio value="Rejected">
              驳回
            </a-radio>
          </a-radio-group>
        </a-form-item>

        <a-form-item label="审核意见">
          <a-textarea
            v-model="comment"

            :rows="4"
            placeholder="请输入审核意见（必填）"
            :maxlength="1000"
            show-word-limit
          />
        </a-form-item>
      </a-form>
    </div>

    <template #footer>
      <a-button @click="handleClose">
        取消
      </a-button>
      <a-button
        type="primary"
        :loading="submitting"
        :disabled="!comment.trim()"
        @click="handleSubmit"
      >
        提交审核
      </a-button>
    </template>
  </a-dialog>
</template>

<style scoped lang="scss">
.review-dialog-content {
  padding: 8px 0;
}
</style>
