<script setup lang="ts">
withDefaults(
  defineProps<{
    message?: string
    tone?: 'default' | 'warning'
  }>(),
  { message: '', tone: 'default' },
)
</script>

<template>
  <footer class="sticky-action-bar" :class="`sticky-action-bar--${tone}`">
    <div v-if="message || $slots.default" class="sticky-action-bar__message">
      <slot>{{ message }}</slot>
    </div>
    <div class="sticky-action-bar__actions">
      <slot name="actions" />
    </div>
  </footer>
</template>

<style scoped lang="scss">
.sticky-action-bar {
  position: sticky;
  z-index: 10;
  bottom: 0;
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 10px 14px;
  border: 1px solid var(--color-border-2);
  background: color-mix(in srgb, var(--color-bg-2) 96%, transparent);
  backdrop-filter: blur(8px);
}

.sticky-action-bar--warning {
  border-color: rgb(var(--warning-6));
  background: var(--color-warning-light-1, #fff7e8);
}

.sticky-action-bar__message {
  min-width: 0;
  margin-right: auto;
  color: var(--color-text-3);
  font-size: 12px;
}

.sticky-action-bar__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 640px) {
  .sticky-action-bar {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }

  .sticky-action-bar__actions {
    justify-content: stretch;
  }

  .sticky-action-bar__actions :deep(.arco-btn) {
    flex: 1;
  }
}
</style>
