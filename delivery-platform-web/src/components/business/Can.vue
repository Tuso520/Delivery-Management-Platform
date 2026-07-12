<script setup lang="ts">
import { computed } from 'vue'

import { usePermission } from '@/composables/usePermission'

const props = withDefaults(
  defineProps<{
    permission?: string
    any?: string[]
    all?: string[]
    disabled?: boolean
    reason?: string
  }>(),
  {
    permission: '',
    any: () => [],
    all: () => [],
    disabled: false,
    reason: '',
  },
)

const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermission()
const allowed = computed(() => {
  if (props.permission && !hasPermission(props.permission)) return false
  if (props.any.length > 0 && !hasAnyPermission(props.any)) return false
  if (props.all.length > 0 && !hasAllPermissions(props.all)) return false
  return true
})
</script>

<template>
  <slot v-if="allowed" :disabled="disabled" :reason="reason" />
  <slot v-else name="denied" />
</template>
