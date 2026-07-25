<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <a-result status="403" :title="title" :subtitle="description">
    <template v-if="$slots.action" #extra>
      <slot name="action" />
    </template>
  </a-result>
</template>
