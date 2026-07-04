<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  type: string
  value: string
}>()

type StatusColorMap = Record<string, { color: string; label: string }>

const statusMaps: Record<string, StatusColorMap> = {
  project: {
    Draft: { color: '#909399', label: '草稿' },
    Active: { color: '#67c23a', label: '进行中' },
    Pending: { color: '#e6a23c', label: '待审核' },
    Completed: { color: '#165dff', label: '已完成' },
    Closed: { color: '#f56c6c', label: '已关闭' },
    Cancelled: { color: '#c0c4cc', label: '已取消' },
  },
  archive: {
    Pending: { color: '#e6a23c', label: '待归档' },
    Uploaded: { color: '#165dff', label: '已上传' },
    Reviewed: { color: '#67c23a', label: '已审核' },
    Rejected: { color: '#f56c6c', label: '已驳回' },
    NA: { color: '#c0c4cc', label: '不适用' },
  },
  review: {
    Pending: { color: '#e6a23c', label: '待审核' },
    Approved: { color: '#67c23a', label: '已通过' },
    Rejected: { color: '#f56c6c', label: '已驳回' },
  },
  risk: {
    Low: { color: '#67c23a', label: '低风险' },
    Medium: { color: '#e6a23c', label: '中风险' },
    High: { color: '#f56c6c', label: '高风险' },
  },
  country: {
    VN: { color: '#165dff', label: '越南' },
    TH: { color: '#67c23a', label: '泰国' },
    MY: { color: '#e6a23c', label: '马来西亚' },
    ID: { color: '#f56c6c', label: '印尼' },
    SG: { color: '#909399', label: '新加坡' },
    OM: { color: '#b37feb', label: '阿曼' },
  },
  boolean: {
    true: { color: '#67c23a', label: '是' },
    false: { color: '#c0c4cc', label: '否' },
  },
}

const statusConfig = computed(() => {
  const map = statusMaps[props.type]
  if (!map) return { color: '#909399', label: props.value || '-' }
  return map[props.value] || { color: '#909399', label: props.value || '-' }
})
</script>

<template>
  <a-tag :color="statusConfig.color" :style="{ color: '#fff', border: 'none' }" size="small">
    {{ statusConfig.label }}
  </a-tag>
</template>
