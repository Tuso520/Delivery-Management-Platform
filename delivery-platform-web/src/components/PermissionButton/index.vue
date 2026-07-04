<script setup lang="ts">
import { computed } from 'vue'
import { usePermission } from '@/composables/usePermission'

const props = defineProps<{
  permission?: string
  role?: string
  permissions?: string[]
}>()

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const { hasPermission, hasRole, hasAnyPermission } = usePermission()

const hasAccess = computed(() => {
  if (props.permission && hasPermission(props.permission)) return true
  if (props.role && hasRole(props.role)) return true
  if (props.permissions && props.permissions.length > 0 && hasAnyPermission(props.permissions))
    return true
  if (!props.permission && !props.role && !props.permissions) return true
  return false
})

function handleClick(event: MouseEvent): void {
  if (!hasAccess.value) return
  emit('click', event)
}
</script>

<template>
  <a-button v-if="hasAccess" v-bind="$attrs" @click="handleClick">
    <slot />
  </a-button>
</template>
