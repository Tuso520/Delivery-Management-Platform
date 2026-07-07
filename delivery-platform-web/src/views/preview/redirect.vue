<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { attachmentApi } from '@/api/attachment'
import { fileApi } from '@/api/file'

const route = useRoute()
const status = ref('正在生成安全预览链接...')
const failed = ref(false)

const title = computed(() => {
  const value = route.query.title
  return typeof value === 'string' && value.trim() ? value : '在线预览'
})

async function resolvePreviewUrl(): Promise<string> {
  const source = route.query.source
  const id = route.query.id
  if (typeof id !== 'string' || !id) {
    throw new Error('missing preview id')
  }

  if (source === 'file') {
    return (await fileApi.createPreviewLink(id)).url
  }
  if (source === 'attachment') {
    return (await attachmentApi.createPreviewLink(id)).url
  }
  throw new Error('unsupported preview source')
}

onMounted(async () => {
  try {
    const url = await resolvePreviewUrl()
    window.location.replace(url)
  } catch {
    failed.value = true
    status.value = '预览链接生成失败，请返回列表重试。'
  }
})
</script>

<template>
  <main class="preview-redirect-page">
    <section class="preview-redirect-panel" :class="{ failed }">
      <span class="preview-redirect-icon">{{ failed ? '!' : '...' }}</span>
      <h1>{{ title }}</h1>
      <p>{{ status }}</p>
    </section>
  </main>
</template>

<style scoped>
.preview-redirect-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  background: #f2f4f8;
  color: #1d2129;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    'PingFang SC',
    'Microsoft YaHei',
    sans-serif;
}

.preview-redirect-panel {
  width: min(440px, calc(100vw - 48px));
  padding: 28px 30px;
  border: 1px solid #e5e6eb;
  background: #fff;
  text-align: center;
  box-shadow: 0 16px 40px rgb(29 33 41 / 8%);
}

.preview-redirect-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  margin-bottom: 14px;
  border: 1px solid #bedaff;
  background: #eaf3ff;
  color: #165dff;
  font-weight: 700;
}

.preview-redirect-panel.failed .preview-redirect-icon {
  border-color: #ffd0c7;
  background: #fff3f0;
  color: #cb272d;
}

h1 {
  margin: 0;
  overflow: hidden;
  color: #1d2129;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

p {
  margin: 10px 0 0;
  color: #4e5969;
  font-size: 13px;
  line-height: 1.6;
}
</style>
