<script setup lang="ts">
import { computed } from 'vue'
import zhCn from '@arco-design/web-vue/es/locale/lang/zh-cn'
import enUs from '@arco-design/web-vue/es/locale/lang/en-us'
import { useLocaleStore } from '@/store/locale'

const localeStore = useLocaleStore()
const arcoLocale = computed(() =>
  localeStore.currentLocale === 'en-US' ? enUs : zhCn,
)
</script>

<template>
  <a-config-provider :locale="arcoLocale">
    <router-view />
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
