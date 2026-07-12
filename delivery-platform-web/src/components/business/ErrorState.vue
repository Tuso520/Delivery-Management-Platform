<script setup lang="ts">
withDefaults(defineProps<{ title: string; description?: string; retryLabel?: string }>(), {
  description: '',
  retryLabel: '',
})

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <a-result status="error" :title="title" :subtitle="description">
    <template v-if="retryLabel || $slots.action" #extra>
      <slot name="action">
        <a-button type="primary" @click="emit('retry')">
          {{ retryLabel }}
        </a-button>
      </slot>
    </template>
  </a-result>
</template>
