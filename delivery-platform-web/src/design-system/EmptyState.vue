<script setup lang="ts">
const props = withDefaults(defineProps<{ title?: string; description?: string }>(), {
  title: '',
  description: '',
})
</script>

<template>
  <a-empty class="business-empty">
    <template v-if="props.title || props.description || $slots.default" #default>
      <strong v-if="props.title">{{ props.title }}</strong>
      <p v-if="props.description">
        {{ props.description }}
      </p>
      <slot />
    </template>
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
