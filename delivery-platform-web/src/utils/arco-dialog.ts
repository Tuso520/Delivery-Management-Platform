import { h, ref } from 'vue'
import { Input, Modal, Textarea } from '@arco-design/web-vue'

type LegacyMessageType = 'success' | 'warning' | 'info' | 'error'

interface LegacyDialogOptions {
  confirmButtonText?: string
  cancelButtonText?: string
  type?: LegacyMessageType
  inputType?: 'text' | 'textarea'
  inputPlaceholder?: string
  inputValue?: string
  inputValidator?: (value: string) => boolean | string
}

function statusFromType(type?: LegacyMessageType): 'normal' | 'success' | 'warning' | 'danger' {
  if (type === 'error') return 'danger'
  if (type === 'success' || type === 'warning') return type
  return 'normal'
}

export function arcoConfirm(
  content: string,
  title = '确认',
  options: LegacyDialogOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false

    Modal.confirm({
      title,
      content,
      okText: options.confirmButtonText ?? '确定',
      cancelText: options.cancelButtonText ?? '取消',
      okButtonProps: {
        status: statusFromType(options.type),
      },
      onOk: () => {
        settled = true
        resolve()
      },
      onCancel: () => {
        settled = true
        reject(new Error('cancel'))
      },
      onClose: () => {
        if (!settled) reject(new Error('cancel'))
      },
    })
  })
}

export function arcoPrompt(
  content: string,
  title = '请输入',
  options: LegacyDialogOptions = {},
): Promise<{ value: string }> {
  const value = ref(options.inputValue ?? '')
  const error = ref('')

  return new Promise((resolve, reject) => {
    let settled = false
    const isTextarea = options.inputType === 'textarea'

    Modal.confirm({
      title,
      okText: options.confirmButtonText ?? '确定',
      cancelText: options.cancelButtonText ?? '取消',
      content: () =>
        h('div', { class: 'arco-prompt-body' }, [
          h('p', { class: 'arco-prompt-message' }, content),
          h(isTextarea ? Textarea : Input, {
            modelValue: value.value,
            placeholder: options.inputPlaceholder,
            autoSize: isTextarea ? { minRows: 3, maxRows: 6 } : undefined,
            onInput: (nextValue: string) => {
              value.value = nextValue
              error.value = ''
            },
            onUpdateModelValue: (nextValue: string) => {
              value.value = nextValue
              error.value = ''
            },
          }),
          error.value ? h('p', { class: 'arco-prompt-error' }, error.value) : null,
        ]),
      onBeforeOk: (done) => {
        const result = options.inputValidator?.(value.value)
        if (typeof result === 'string') {
          error.value = result
          done(false)
          return
        }
        if (result === false) {
          error.value = '输入不符合要求'
          done(false)
          return
        }
        settled = true
        resolve({ value: value.value })
        done(true)
      },
      onCancel: () => {
        settled = true
        reject(new Error('cancel'))
      },
      onClose: () => {
        if (!settled) reject(new Error('cancel'))
      },
    })
  })
}
