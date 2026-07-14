<script setup lang="ts">
withDefaults(defineProps<{ label: string; value?: string | number | null }>(), { value: '—' })
</script>

<template>
  <div class="readonly-field">
    <span>{{ label }}</span>
    <strong><slot>{{ value ?? '—' }}</slot></strong>
  </div>
</template>

<style scoped>
.readonly-field { min-width: 0; padding: 8px 0; }
.readonly-field > span { display: block; margin-bottom: 5px; color: var(--color-text-3); font-size: 12px; }
.readonly-field > strong { display: block; overflow-wrap: anywhere; color: var(--color-text-1); font-size: 13px; font-weight: 500; }
</style>
