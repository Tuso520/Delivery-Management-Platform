<script setup lang="ts">
import { computed, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { fileApi } from '@/api/file'
import type { UploadedFile } from '@/types/file'

const props = defineProps<{
  projectId: string
  archiveItemId?: string
  allowedTypes?: string[]
  maxSize?: number
}>()

const emit = defineEmits<{
  (e: 'upload-success', file: UploadedFile): void
  (e: 'upload-error', error: Error): void
}>()

const uploadProgress = ref(0)
const uploading = ref(false)

const acceptTypes = computed(() => {
  if (!props.allowedTypes?.length) return ''
  const map: Record<string, string> = {
    pdf: '.pdf',
    doc: '.doc',
    docx: '.docx',
    xls: '.xls',
    xlsx: '.xlsx',
    ppt: '.ppt',
    pptx: '.pptx',
    jpg: '.jpg',
    jpeg: '.jpeg',
    png: '.png',
    gif: '.gif',
    zip: '.zip',
    rar: '.rar',
  }
  return props.allowedTypes.map((type) => map[type] || `.${type}`).join(',')
})

const maxFileSize = computed(() => props.maxSize || 100 * 1024 * 1024)

function beforeUpload(rawFile: File): boolean {
  const ext = rawFile.name.split('.').pop()?.toLowerCase()

  if (props.allowedTypes?.length && (!ext || !props.allowedTypes.includes(ext))) {
    Message.error(`不支持的文件类型，仅支持：${props.allowedTypes.join(', ')}`)
    return false
  }

  if (rawFile.size > maxFileSize.value) {
    Message.error(`单个文件不能超过 ${maxFileSize.value / 1024 / 1024}MB`)
    return false
  }

  return true
}

async function handleUpload(options: { file: File }): Promise<void> {
  uploading.value = true
  uploadProgress.value = 0

  try {
    const result = await fileApi.upload(
      props.projectId,
      props.archiveItemId,
      options.file,
      undefined,
      (progressEvent) => {
        if (progressEvent.total) {
          uploadProgress.value = Math.round(
            (progressEvent.loaded / progressEvent.total) * 100,
          )
        }
      },
    )

    Message.success('上传成功，已进入审批或归档流程')
    emit('upload-success', result)
    uploadProgress.value = 0
  } catch (error) {
    Message.error('上传失败')
    emit('upload-error', error instanceof Error ? error : new Error('上传失败'))
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="file-uploader">
    <a-upload
      :accept="acceptTypes"
      :show-file-list="false"
      :auto-upload="true"
      :before-upload="beforeUpload"
      :http-request="handleUpload"
      drag
    >
      <div v-if="!uploading" class="upload-placeholder">
        <a-icon class="upload-icon" :size="42">
          <UploadFilled />
        </a-icon>
        <div class="upload-text">
          拖拽文件到此处，或 <em>点击上传</em>
        </div>
        <div v-if="props.allowedTypes?.length" class="upload-hint">
          支持 {{ props.allowedTypes.join(', ') }} 格式
        </div>
        <div class="upload-hint">
          单个文件不超过 {{ maxFileSize / 1024 / 1024 }}MB
        </div>
      </div>
      <div v-else class="upload-progress-wrapper">
        <a-progress
          type="circle"
          :percentage="uploadProgress"
          :width="108"
          :stroke-width="8"
          color="#165dff"
        />
        <div class="upload-progress-text">
          正在上传...
        </div>
      </div>
    </a-upload>
  </div>
</template>

<style scoped lang="scss">
.file-uploader {
  width: 100%;

  :deep(.arco-upload),
  :deep(.arco-upload-trigger) {
    width: 100%;
  }

  :deep(.arco-upload-draggable) {
    width: 100%;
    height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0;
  }
}

.upload-placeholder {
  padding: 18px;
  text-align: center;
}

.upload-icon {
  margin-bottom: 10px;
  color: rgb(var(--primary-6));
}

.upload-text {
  margin-bottom: 7px;
  color: var(--color-text-2);
  font-size: 14px;

  em {
    color: rgb(var(--primary-6));
    font-style: normal;
  }
}

.upload-hint {
  margin-top: 3px;
  color: var(--color-text-3);
  font-size: 12px;
}

.upload-progress-wrapper {
  padding: 18px;
  text-align: center;
}

.upload-progress-text {
  margin-top: 10px;
  color: var(--color-text-2);
  font-size: 14px;
}
</style>
