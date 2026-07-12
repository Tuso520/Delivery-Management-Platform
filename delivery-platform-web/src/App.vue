<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import zhCn from '@arco-design/web-vue/es/locale/lang/zh-cn'
import enUs from '@arco-design/web-vue/es/locale/lang/en-us'
import { useFilePreview } from '@/composables/useFilePreview'
import { useLocaleStore } from '@/store/locale'

const AttachmentPreviewModal = defineAsyncComponent(() =>
  import('@/components/AttachmentPreviewModal/index.vue'),
)

const localeStore = useLocaleStore()
const filePreview = useFilePreview()
const arcoLocale = computed(() =>
  localeStore.currentLocale === 'en-US' ? enUs : zhCn,
)
</script>

<template>
  <a-config-provider :locale="arcoLocale">
    <router-view />
    <AttachmentPreviewModal
      :visible="filePreview.visible.value"
      :resource-id="filePreview.resourceId.value"
      :title="filePreview.title.value"
      @update:visible="filePreview.closePreview"
    />
  </a-config-provider>
</template>

<style lang="scss">
html,
body,
#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  font-family: inherit;
}
</style>
