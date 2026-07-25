<script setup lang="ts">
import { computed, useAttrs } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    visible: boolean
    title?: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    unmountOnClose?: boolean
    footer?: boolean
    maskClosable?: boolean
    width?: string | number
  }>(),
  {
    title: '',
    size: 'md',
    unmountOnClose: true,
    footer: true,
    maskClosable: true,
    width: undefined,
  },
)

const emit = defineEmits<{
  'update:visible': [value: boolean]
  cancel: []
  ok: []
}>()

const attrs = useAttrs()
const widths = { sm: '560px', md: '720px', lg: '960px', xl: '80vw' } as const
const resolvedWidth = computed(() => props.width ?? widths[props.size])
</script>

<template>
  <a-drawer
    v-bind="attrs"
    :visible="visible"
    :title="title"
    :width="resolvedWidth"
    :footer="footer"
    :unmount-on-close="unmountOnClose"
    :mask-closable="maskClosable"
    class="business-drawer"
    @update:visible="emit('update:visible', $event)"
    @cancel="emit('cancel')"
    @ok="emit('ok')"
  >
    <template v-if="$slots.title" #title>
      <slot name="title" />
    </template>
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </a-drawer>
</template>
