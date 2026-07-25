<script setup lang="ts">
withDefaults(defineProps<{ title?: string; description?: string }>(), {
  title: '',
  description: '',
})
</script>

<template>
  <a-empty class="business-empty">
    <template v-if="title || description" #description>
      <strong v-if="title">{{ title }}</strong>
      <p v-if="description">
        {{ description }}
      </p>
    </template>
    <slot />
  </a-empty>
</template>

<style scoped lang="scss">
.business-empty strong,
.business-empty p {
  display: block;
}

.business-empty p {
  margin: 3px 0 0;
  color: var(--color-text-3);
  font-size: 12px;
}
</style>
