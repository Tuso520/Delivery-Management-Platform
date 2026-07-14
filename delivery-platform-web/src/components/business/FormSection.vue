<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <section class="form-section">
    <header class="form-section__header">
      <h3>{{ title }}</h3>
      <p v-if="description">
        {{ description }}
      </p>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.form-section { padding: 4px 0 18px; border-bottom: 1px solid var(--color-border-2); }
.form-section:last-child { border-bottom: 0; }
.form-section__header { margin-bottom: 14px; }
.form-section__header h3 { margin: 0; color: var(--color-text-1); font-size: 15px; font-weight: 600; }
.form-section__header p { margin: 4px 0 0; color: var(--color-text-3); font-size: 12px; }
</style>
