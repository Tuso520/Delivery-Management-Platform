<script setup lang="ts">
import { ref, watch } from 'vue'
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

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      decision.value = 'Approved'
      comment.value = ''
    }
  },
)

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
    Message.success(decision.value === 'Approved' ? '审核已通过' : '审核已驳回')
    emit('review-complete')
  } finally {
    submitting.value = false
  }
}

function handleClose() {
  emit('update:visible', false)
}
</script>

<template>
  <a-modal
    :visible="props.visible"
    title="文件审核"
    :width="560"
    :mask-closable="false"
    @update:visible="emit('update:visible', $event)"
    @cancel="handleClose"
  >
    <div class="review-dialog-content">
      <a-descriptions :column="1" bordered size="small">
        <a-descriptions-item label="文件名称">
          {{ props.fileName }}
        </a-descriptions-item>
      </a-descriptions>

      <a-divider />

      <a-form :model="{}" label-width="100px">
        <a-form-item label="审核结果">
          <a-radio-group v-model="decision">
            <a-radio value="Approved">通过</a-radio>
            <a-radio value="Rejected">驳回</a-radio>
          </a-radio-group>
        </a-form-item>

        <a-form-item label="审核意见">
          <a-textarea
            v-model="comment"
            :rows="4"
            placeholder="请输入审核意见（必填）"
            :max-length="1000"
            show-word-limit
          />
        </a-form-item>
      </a-form>
    </div>

    <template #footer>
      <a-button @click="handleClose">取消</a-button>
      <a-button
        type="primary"
        :loading="submitting"
        :disabled="!comment.trim()"
        @click="handleSubmit"
      >
        提交审核
      </a-button>
    </template>
  </a-modal>
</template>

<style scoped lang="scss">
.review-dialog-content {
  padding: 8px 0;
}
</style>
