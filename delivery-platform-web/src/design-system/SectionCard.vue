<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
    bordered?: boolean
    bodyClass?: string
  }>(),
  { title: '', description: '', bordered: true, bodyClass: '' },
)
</script>

<template>
  <a-card :bordered="bordered" class="section-card">
    <template v-if="title || description || $slots.title || $slots.extra" #title>
      <div class="section-card__heading">
        <slot name="title">
          <div>
            <strong v-if="title">{{ title }}</strong>
            <p v-if="description">
              {{ description }}
            </p>
          </div>
        </slot>
        <slot name="extra" />
      </div>
    </template>
    <div :class="bodyClass">
      <slot />
    </div>
  </a-card>
</template>

<style scoped lang="scss">
.section-card {
  min-width: 0;
}

.section-card__heading {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.section-card__heading strong {
  color: var(--color-text-1);
  font-size: 15px;
  font-weight: 650;
}

.section-card__heading p {
  margin: 2px 0 0;
  color: var(--color-text-3);
  font-size: 12px;
}
</style>
