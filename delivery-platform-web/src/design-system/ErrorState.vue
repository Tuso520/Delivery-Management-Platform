<script setup lang="ts">
const props = withDefaults(
  defineProps<{ title: string; description?: string; retryLabel?: string }>(),
  {
    description: '',
    retryLabel: '',
  },
)

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <a-result status="error" :title="props.title" :subtitle="props.description">
    <template v-if="props.retryLabel || $slots.action" #extra>
      <slot name="action">
        <a-button type="primary" @click="emit('retry')">
          {{ props.retryLabel }}
        </a-button>
      </slot>
    </template>
  </a-result>
</template>
