<script setup lang="ts">
withDefaults(defineProps<{ columns?: 3 | 4 }>(), { columns: 3 })
</script>

<template>
  <div class="form-grid" :class="`form-grid--${columns}`">
    <slot />
  </div>
</template>

<style scoped>
.form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 16px; }
.form-grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.form-grid :deep(.span-2) { grid-column: span 2; }
.form-grid :deep(.span-full) { grid-column: 1 / -1; }
@media (max-width: 1280px) { .form-grid--4 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 900px) { .form-grid, .form-grid--4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .form-grid, .form-grid--4 { grid-template-columns: 1fr; } .form-grid :deep(.span-2), .form-grid :deep(.span-full) { grid-column: auto; } }
</style>
