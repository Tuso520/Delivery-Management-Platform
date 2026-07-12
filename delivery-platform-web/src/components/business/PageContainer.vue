<script setup lang="ts">
withDefaults(
  defineProps<{
    scrollable?: boolean
    gap?: 'compact' | 'normal' | 'relaxed'
  }>(),
  {
    scrollable: true,
    gap: 'normal',
  },
)
</script>

<template>
  <section
    class="page-container"
    :class="[`page-container--${gap}`, { 'page-container--scrollable': scrollable }]"
  >
    <slot />
  </section>
</template>

<style scoped lang="scss">
.page-container {
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
}

.page-container--compact {
  gap: 8px;
}

.page-container--normal {
  gap: 12px;
}

.page-container--relaxed {
  gap: 16px;
}

.page-container--scrollable {
  overflow: auto;
}
</style>
