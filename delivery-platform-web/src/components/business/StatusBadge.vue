<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { statusDefinition, type StatusDomain } from './status-registry'

const props = defineProps<{
  domain: StatusDomain
  status: string
  label?: string
}>()

const { t, te } = useI18n()
const definition = computed(() => statusDefinition(props.domain, props.status))
const text = computed(() => {
  if (props.label) return props.label
  const key = definition.value.labelKey
  return key && te(key) ? t(key) : props.status
})
</script>

<template>
  <a-tag :color="definition.color" bordered>
    {{ text }}
  </a-tag>
</template>
