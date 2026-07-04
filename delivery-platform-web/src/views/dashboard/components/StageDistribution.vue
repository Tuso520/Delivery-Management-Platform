<script setup lang="ts">
import { computed } from 'vue'
import { useLocaleStore } from '@/store/locale'
import { localizeProjectStage } from '@/utils/project-localization'

const props = defineProps<{
  items: Array<{ stage: string; count: number }>
}>()

const localeStore = useLocaleStore()
const total = computed(() =>
  props.items.reduce((sum, item) => sum + item.count, 0),
)
</script>

<template>
  <section class="data-panel">
    <header class="panel-header">
      <div>
        <h3>项目阶段分布</h3>
        <p>当前项目所处交付阶段</p>
      </div>
      <strong>{{ total }} 个项目</strong>
    </header>
    <div class="stage-list">
      <div v-for="item in items" :key="item.stage" class="stage-row">
        <div class="stage-label">
          <span>{{ localizeProjectStage(item.stage, localeStore.currentLocale) }}</span>
          <strong>{{ item.count }}</strong>
        </div>
        <a-progress
          :percentage="total ? Math.round(item.count / total * 100) : 0"
          :show-text="false"
          :stroke-width="8"
          color="#4d8475"
        />
      </div>
      <a-empty v-if="items.length === 0" description="暂无项目阶段数据" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.data-panel { min-width:0; border:1px solid #e5e6eb; background:#fff; }
.panel-header { min-height:68px; display:flex; align-items:center; justify-content:space-between; padding:15px 20px; border-bottom:1px solid #f2f3f5;
  h3 { margin:0; color:#1d2129; font-size:16px; }
  p { margin:4px 0 0; color:#86909c; font-size:12px; }
  strong { color:#65716b; font-size:13px; }
}
.stage-list { padding:18px 20px; display:grid; gap:15px; }
.stage-label { display:flex; justify-content:space-between; margin-bottom:7px; color:#4e5969; font-size:13px; }
</style>
