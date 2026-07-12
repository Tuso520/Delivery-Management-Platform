<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'

import { reviewApi } from '@/api/review'
import { queryKeys } from '@/query/keys'

const props = defineProps<{
  visible: boolean
  taskId: string
  fileName: string
  currentStepNo: number
  totalSteps: number
}>()

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void
  (event: 'review-complete'): void
}>()
const queryClient = useQueryClient()
const { t } = useI18n()

const form = reactive({
  decision: 'APPROVED' as 'APPROVED' | 'REJECTED',
  comment: '',
})
const reviewMutation = useMutation({
  mutationFn: ({
    taskId,
    decision,
    comment,
  }: {
    taskId: string
    decision: 'APPROVED' | 'REJECTED'
    comment: string
  }) =>
    decision === 'APPROVED'
      ? reviewApi.approve(taskId, comment ? { comment } : {})
      : reviewApi.reject(taskId, { comment }),
  retry: false,
  onSuccess: async (_, variables) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews.lists() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews.summary() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews.detail(variables.taskId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews.history(variables.taskId) }),
    ]),
})
const submitting = computed(() => reviewMutation.isPending.value)
const isReject = computed(() => form.decision === 'REJECTED')
const submitDisabled = computed(() => !props.taskId || (isReject.value && !form.comment.trim()))

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.decision = 'APPROVED'
    form.comment = ''
  },
)

async function handleSubmit(): Promise<void> {
  const comment = form.comment.trim()
  if (isReject.value && !comment) {
    Message.warning(t('review.dialog.rejectCommentRequired'))
    return
  }

  await reviewMutation.mutateAsync({
    taskId: props.taskId,
    decision: form.decision,
    comment,
  })
  if (form.decision === 'APPROVED') {
    Message.success(t('review.dialog.approveSuccess'))
  } else {
    Message.success(t('review.dialog.rejectSuccess'))
  }
  emit('review-complete')
}

function handleClose(): void {
  if (!submitting.value) emit('update:visible', false)
}
</script>

<template>
  <a-modal
    :visible="props.visible"
    :title="t('review.dialog.title')"
    :width="560"
    :mask-closable="false"
    :esc-to-close="!submitting"
    :closable="!submitting"
    @update:visible="emit('update:visible', $event)"
    @cancel="handleClose"
  >
    <div class="review-dialog-content">
      <a-descriptions :column="1" bordered size="small">
        <a-descriptions-item :label="t('review.dialog.fileName')">
          {{ props.fileName }}
        </a-descriptions-item>
        <a-descriptions-item :label="t('review.dialog.currentProgress')">
          {{
            t('review.dialog.stepProgress', {
              current: props.currentStepNo,
              total: props.totalSteps,
            })
          }}
        </a-descriptions-item>
      </a-descriptions>

      <a-alert class="assignment-alert" type="info">
        {{ t('review.dialog.assignmentHint') }}
      </a-alert>

      <a-form :model="form" layout="vertical">
        <a-form-item field="decision" :label="t('review.dialog.result')" required>
          <a-radio-group v-model="form.decision" type="button">
            <a-radio value="APPROVED">
              {{ t('review.dialog.approve') }}
            </a-radio>
            <a-radio value="REJECTED">
              {{ t('review.dialog.reject') }}
            </a-radio>
          </a-radio-group>
        </a-form-item>

        <a-form-item
          field="comment"
          :label="
            isReject ? t('review.dialog.commentRequired') : t('review.dialog.commentOptional')
          "
          :required="isReject"
        >
          <a-textarea
            v-model="form.comment"
            :auto-size="{ minRows: 5, maxRows: 5 }"
            :placeholder="
              isReject
                ? t('review.dialog.rejectPlaceholder')
                : t('review.dialog.commentPlaceholder')
            "
            :max-length="2000"
            show-word-limit
          />
        </a-form-item>
      </a-form>
    </div>

    <template #footer>
      <a-button :disabled="submitting" @click="handleClose">
        {{ t('common.cancel') }}
      </a-button>
      <a-button
        type="primary"
        :status="isReject ? 'danger' : 'normal'"
        :loading="submitting"
        :disabled="submitDisabled"
        @click="handleSubmit"
      >
        {{ isReject ? t('review.dialog.confirmReject') : t('review.dialog.confirmApprove') }}
      </a-button>
    </template>
  </a-modal>
</template>

<style scoped lang="scss">
.review-dialog-content {
  display: grid;
  gap: 16px;
  padding: 4px 0;
}

.assignment-alert {
  margin: 0;
}
</style>
