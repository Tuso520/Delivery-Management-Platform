<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
}>()
</script>

<template>
  <header class="page-toolbar">
    <div v-if="title || description || $slots.title" class="page-toolbar__heading">
      <slot name="title">
        <h2 v-if="title">
          {{ title }}
        </h2>
      </slot>
      <p v-if="description">
        {{ description }}
      </p>
    </div>
    <div v-if="$slots.filters" class="page-toolbar__filters">
      <slot name="filters" />
    </div>
    <div v-if="$slots.actions" class="page-toolbar__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped lang="scss">
.page-toolbar {
  min-width: 0;
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
}

.page-toolbar__heading {
  min-width: 0;
  margin-right: auto;
}

.page-toolbar__heading h2 {
  margin: 0;
  color: var(--color-text-1);
  font-size: 18px;
  font-weight: 650;
  line-height: 1.3;
}

.page-toolbar__heading p {
  margin: 3px 0 0;
  color: var(--color-text-3);
  font-size: 12px;
}

.page-toolbar__filters,
.page-toolbar__actions {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 900px) {
  .page-toolbar {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .page-toolbar__heading,
  .page-toolbar__filters,
  .page-toolbar__actions {
    width: 100%;
  }
}
</style>
