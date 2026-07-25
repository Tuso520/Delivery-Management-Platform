<script setup lang="ts">
import { useAttrs } from 'vue'

defineOptions({ inheritAttrs: false })

withDefaults(
  defineProps<{
    visible: boolean
    title?: string
    width?: string | number
    unmountOnClose?: boolean
    maskClosable?: boolean
    okLoading?: boolean
    okText?: string
    cancelText?: string
    footer?: boolean
    closable?: boolean
    onBeforeOk?: (done: (closed: boolean) => void) => void | boolean | Promise<void | boolean>
  }>(),
  {
    title: '',
    width: 680,
    unmountOnClose: true,
    maskClosable: true,
    okLoading: false,
    okText: '',
    cancelText: '',
    footer: true,
    closable: true,
    onBeforeOk: undefined,
  },
)

const emit = defineEmits<{
  'update:visible': [value: boolean]
  cancel: []
  ok: []
}>()

const attrs = useAttrs()
</script>

<template>
  <a-modal
    v-bind="attrs"
    :visible="visible"
    :title="title"
    :width="width"
    :unmount-on-close="unmountOnClose"
    :mask-closable="maskClosable"
    :ok-loading="okLoading"
    :ok-text="okText"
    :cancel-text="cancelText"
    :footer="footer"
    :closable="closable"
    :on-before-ok="onBeforeOk"
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
  </a-modal>
</template>
