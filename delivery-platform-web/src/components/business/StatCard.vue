<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value: string | number
    active?: boolean
    interactive?: boolean
    tone?: 'blue' | 'green' | 'cyan' | 'red'
  }>(),
  { active: false, interactive: false, tone: 'blue' },
)

const emit = defineEmits<{ select: [] }>()
</script>

<template>
  <button
    v-if="interactive"
    class="stat-card"
    :class="[`stat-card--${tone}`, { 'stat-card--active': active, 'stat-card--interactive': interactive }]"
    type="button"
    :aria-pressed="active"
    @click="emit('select')"
  >
    <span class="stat-card__label">{{ label }}</span>
    <strong class="stat-card__value">{{ value }}</strong>
    <slot />
  </button>
  <div v-else class="stat-card" :class="`stat-card--${tone}`">
    <span class="stat-card__label">{{ label }}</span>
    <strong class="stat-card__value">{{ value }}</strong>
    <slot />
  </div>
</template>

<style scoped lang="scss">
.stat-card {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--color-border-2);
  border-radius: 0;
  background: var(--color-bg-2);
  color: var(--color-text-1);
  text-align: left;
}

.stat-card--interactive {
  cursor: pointer;
}

.stat-card--interactive:hover,
.stat-card--active {
  border-color: rgb(var(--primary-6));
  background: rgb(var(--primary-1));
}

.stat-card__label,
.stat-card__value {
  display: block;
}
.stat-card--blue { --stat-color: var(--primary-6); }
.stat-card--green { --stat-color: var(--success-6); }
.stat-card--cyan { --stat-color: 0, 180, 190; }
.stat-card--red { --stat-color: var(--danger-6); }
.stat-card__value { color: rgb(var(--stat-color)); font-size: 30px; }
.stat-card--active { box-shadow: inset 3px 0 rgb(var(--stat-color)); }

.stat-card__label {
  color: var(--color-text-3);
  font-size: 12px;
}

.stat-card__value {
  margin-top: 4px;
  font-size: 24px;
  line-height: 1.2;
}
</style>
