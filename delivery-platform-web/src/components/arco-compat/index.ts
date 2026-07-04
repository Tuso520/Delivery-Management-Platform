// @ts-nocheck
import type { App, CSSProperties, Directive, PropType, VNode } from 'vue'
import { defineComponent, h } from 'vue'
import {
  Button,
  Drawer,
  Form,
  FormItem,
  Input,
  Modal,
  Pagination,
  Progress,
  Radio,
  RadioGroup,
  Table,
  TableColumn,
  TabPane,
  Tabs,
  Tag,
  Textarea,
  Upload,
} from '@arco-design/web-vue'
import type { RequestOption, UploadRequest } from '@arco-design/web-vue'

type ButtonStatus = 'normal' | 'success' | 'warning' | 'danger'
type ButtonType = 'text' | 'dashed' | 'outline' | 'primary' | 'secondary'

function buttonStatus(type?: string): ButtonStatus {
  if (type === 'danger') return 'danger'
  if (type === 'success') return 'success'
  if (type === 'warning') return 'warning'
  return 'normal'
}

function buttonType(type?: string, link?: boolean, text?: boolean): ButtonType | undefined {
  if (link || text) return 'text'
  if (type === 'danger' || type === 'success' || type === 'warning' || type === 'info') return 'secondary'
  if (type === 'primary') return 'primary'
  return type as ButtonType | undefined
}

function tagColor(type?: string, color?: string): string | undefined {
  if (color) return color
  if (type === 'success') return 'green'
  if (type === 'warning') return 'orange'
  if (type === 'danger' || type === 'error') return 'red'
  if (type === 'primary') return 'blue'
  if (type === 'info') return 'gray'
  return undefined
}

function resolvePath(record: Record<string, unknown>, path?: string): unknown {
  if (!path) return ''
  return path.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[key]
    return undefined
  }, record)
}

export const ButtonCompat = defineComponent({
  name: 'AButton',
  inheritAttrs: false,
  props: {
    type: String,
    status: String,
    size: String,
    loading: Boolean,
    disabled: Boolean,
    link: Boolean,
    text: Boolean,
    plain: Boolean,
    circle: Boolean,
    round: Boolean,
    nativeType: String,
    htmlType: String,
    href: String,
  },
  emits: ['click'],
  setup(props, { attrs, slots, emit }) {
    return () =>
      h(
        Button,
        {
          ...attrs,
          type: buttonType(props.type, props.link, props.text),
          status: props.status ?? buttonStatus(props.type),
          size: props.size,
          loading: props.loading,
          disabled: props.disabled,
          shape: props.circle ? 'circle' : props.round ? 'round' : undefined,
          htmlType: props.htmlType ?? props.nativeType,
          href: props.href,
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots,
      )
  },
})

export const TagCompat = defineComponent({
  name: 'ATag',
  inheritAttrs: false,
  props: {
    type: String,
    color: String,
    size: String,
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        Tag,
        {
          ...attrs,
          color: tagColor(props.type, props.color),
          size: props.size,
        },
        slots,
      )
  },
})

export const IconCompat = defineComponent({
  name: 'AIcon',
  inheritAttrs: false,
  props: {
    size: [String, Number],
    color: String,
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        'span',
        {
          ...attrs,
          class: ['arco-legacy-icon', attrs.class],
          style: {
            ...(attrs.style as CSSProperties),
            color: props.color,
            fontSize: props.size ? `${props.size}px` : undefined,
          },
        },
        slots.default?.(),
      )
  },
})

export const TableCompat = defineComponent({
  name: 'ATable',
  inheritAttrs: false,
  props: {
    data: {
      type: Array as PropType<unknown[]>,
      default: () => [],
    },
    loading: Boolean,
    border: Boolean,
    bordered: Boolean,
    stripe: Boolean,
    size: String,
    rowKey: String,
    height: [String, Number],
    maxHeight: [String, Number],
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        Table,
        {
          ...attrs,
          data: props.data,
          loading: props.loading,
          bordered: props.border || props.bordered,
          stripe: props.stripe,
          size: props.size,
          rowKey: props.rowKey,
          scroll: props.maxHeight ? { y: props.maxHeight } : undefined,
          pagination: false,
        },
        slots,
      )
  },
})

export const TableColumnCompat = defineComponent({
  name: 'TableColumn',
  inheritAttrs: false,
  props: {
    prop: String,
    dataIndex: String,
    label: String,
    title: String,
    type: String,
    width: [String, Number],
    minWidth: [String, Number],
    fixed: [String, Boolean],
    align: String,
    showOverflowTooltip: Boolean,
    tooltip: Boolean,
    formatter: Function as PropType<(row: unknown, column: unknown, value: unknown) => string>,
  },
  setup(props, { attrs, slots }) {
    return () => {
      const dataIndex = props.dataIndex ?? props.prop
      return h(
        TableColumn,
        {
          ...attrs,
          dataIndex,
          title: props.title ?? props.label,
          width: typeof props.width === 'string' ? Number(props.width) || undefined : props.width,
          minWidth: typeof props.minWidth === 'string' ? Number(props.minWidth) || undefined : props.minWidth,
          fixed: props.fixed === true ? 'right' : props.fixed || undefined,
          align: props.align,
          tooltip: props.tooltip || props.showOverflowTooltip,
        },
        {
          default: (scope?: { record?: Record<string, unknown>; column?: unknown; rowIndex?: number }) => {
            if (!scope?.record) return ''
            const record = scope.record
            const column = scope?.column
            const rowIndex = scope?.rowIndex ?? -1
            if (slots.default) {
              return slots.default({
                ...scope,
                record,
                row: record,
                column,
                rowIndex,
                $index: rowIndex,
              })
            }
            const value = resolvePath(record, dataIndex)
            if (props.formatter) return props.formatter(record, column, value)
            return value == null ? '' : String(value)
          },
        },
      )
    }
  },
})

export const FormCompat = defineComponent({
  name: 'AForm',
  inheritAttrs: false,
  props: {
    model: Object,
    rules: Object,
    inline: Boolean,
    labelWidth: [String, Number],
    labelPosition: String,
  },
  setup(props, { attrs, slots, expose }) {
    let formRef: InstanceType<typeof Form> | undefined
    expose({
      validate: (...args: unknown[]) => formRef?.validate?.(...args),
      resetFields: (...args: unknown[]) => formRef?.resetFields?.(...args),
      clearValidate: (...args: unknown[]) => formRef?.clearValidate?.(...args),
    })
    return () =>
      h(
        Form,
        {
          ...attrs,
          ref: (instance: InstanceType<typeof Form>) => {
            formRef = instance
          },
          model: props.model,
          rules: props.rules,
          layout: props.inline ? 'inline' : undefined,
          autoLabelWidth: !props.labelWidth,
        },
        slots,
      )
  },
})

export const FormItemCompat = defineComponent({
  name: 'AFormItem',
  inheritAttrs: false,
  props: {
    prop: String,
    field: String,
    label: String,
    rules: [Object, Array] as PropType<unknown>,
    required: Boolean,
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        FormItem,
        {
          ...attrs,
          field: props.field ?? props.prop,
          label: props.label,
          rules: props.rules,
          required: props.required,
        },
        slots,
      )
  },
})

export const InputCompat = defineComponent({
  name: 'AInput',
  inheritAttrs: false,
  props: {
    modelValue: [String, Number],
    type: String,
    rows: Number,
    autosize: [Boolean, Object],
  },
  emits: ['update:modelValue', 'input', 'change', 'keyup'],
  setup(props, { attrs, slots, emit }) {
    return () => {
      const component = props.type === 'textarea' ? Textarea : Input
      return h(
        component,
        {
          ...attrs,
          modelValue: props.modelValue,
          autoSize: props.autosize,
          rows: props.rows,
          type: props.type === 'textarea' ? undefined : props.type,
          onInput: (value: string) => emit('input', value),
          onChange: (value: string) => emit('change', value),
          'onUpdate:modelValue': (value: string) => emit('update:modelValue', value),
        },
        slots,
      )
    }
  },
})

export const DialogCompat = defineComponent({
  name: 'ADialog',
  inheritAttrs: false,
  props: {
    modelValue: Boolean,
    visible: Boolean,
    title: String,
    width: [String, Number],
    closeOnClickModal: Boolean,
    destroyOnClose: Boolean,
    fullscreen: Boolean,
  },
  emits: ['update:modelValue', 'update:visible', 'close', 'open'],
  setup(props, { attrs, slots, emit }) {
    return () =>
      h(
        Modal,
        {
          ...attrs,
          visible: props.visible || props.modelValue,
          title: props.title,
          width: props.width,
          fullscreen: props.fullscreen,
          unmountOnClose: props.destroyOnClose,
          maskClosable: props.closeOnClickModal,
          onOpen: () => emit('open'),
          onClose: () => emit('close'),
          'onUpdate:visible': (value: boolean) => {
            emit('update:modelValue', value)
            emit('update:visible', value)
          },
        },
        slots,
      )
  },
})

export const DrawerCompat = defineComponent({
  name: 'ADrawer',
  inheritAttrs: false,
  props: {
    modelValue: Boolean,
    visible: Boolean,
    title: String,
    size: [String, Number],
    width: [String, Number],
  },
  emits: ['update:modelValue', 'update:visible', 'close'],
  setup(props, { attrs, slots, emit }) {
    return () =>
      h(
        Drawer,
        {
          ...attrs,
          visible: props.visible || props.modelValue,
          title: props.title,
          width: props.width ?? props.size,
          onClose: () => emit('close'),
          'onUpdate:visible': (value: boolean) => {
            emit('update:modelValue', value)
            emit('update:visible', value)
          },
        },
        slots,
      )
  },
})

export const PaginationCompat = defineComponent({
  name: 'APagination',
  inheritAttrs: false,
  props: {
    total: {
      type: Number,
      default: 0,
    },
    currentPage: Number,
    current: Number,
    pageSize: Number,
    pageSizes: Array as PropType<number[]>,
    layout: String,
    background: Boolean,
  },
  emits: ['update:currentPage', 'update:current-page', 'update:pageSize', 'update:page-size', 'current-change', 'size-change', 'change'],
  setup(props, { attrs, emit }) {
    return () =>
      h(Pagination, {
        ...attrs,
        total: props.total,
        current: props.current ?? props.currentPage,
        pageSize: props.pageSize,
        pageSizeOptions: props.pageSizes,
        showTotal: props.layout?.includes('total'),
        showPageSize: props.layout?.includes('sizes'),
        showJumper: props.layout?.includes('jumper'),
        onChange: (page: number) => {
          emit('update:currentPage', page)
          emit('update:current-page', page)
          emit('current-change', page)
          emit('change', page)
        },
        onPageSizeChange: (size: number) => {
          emit('update:pageSize', size)
          emit('update:page-size', size)
          emit('size-change', size)
        },
      })
  },
})

export const TabsCompat = defineComponent({
  name: 'ATabs',
  inheritAttrs: false,
  props: {
    modelValue: [String, Number],
    activeKey: [String, Number],
    type: String,
  },
  emits: ['update:modelValue', 'update:activeKey', 'change', 'tab-click'],
  setup(props, { attrs, slots, emit }) {
    return () =>
      h(
        Tabs,
        {
          ...attrs,
          activeKey: props.activeKey ?? props.modelValue,
          type: props.type === 'border-card' ? 'card' : props.type,
          'onUpdate:activeKey': (value: string | number) => {
            emit('update:modelValue', value)
            emit('update:activeKey', value)
            emit('change', value)
          },
          onTabClick: (key: string | number) => emit('tab-click', key),
        },
        slots,
      )
  },
})

export const TabPaneCompat = defineComponent({
  name: 'ATabPane',
  inheritAttrs: false,
  props: {
    name: [String, Number],
    key: [String, Number],
    label: String,
    title: String,
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        TabPane,
        {
          ...attrs,
          key: props.key ?? props.name,
          title: props.title ?? props.label,
        },
        slots,
      )
  },
})

export const SegmentedCompat = defineComponent({
  name: 'ASegmented',
  inheritAttrs: false,
  props: {
    modelValue: [String, Number, Boolean],
    options: {
      type: Array as PropType<Array<string | number | { label: string; value: string | number | boolean }>>,
      default: () => [],
    },
    size: String,
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { attrs, emit }) {
    return () =>
      h(RadioGroup, {
        ...attrs,
        type: 'button',
        modelValue: props.modelValue,
        options: props.options,
        size: props.size,
        'onUpdate:modelValue': (value: string | number | boolean) => {
          emit('update:modelValue', value)
          emit('change', value)
        },
      })
  },
})

export const RadioButtonCompat = defineComponent({
  name: 'ARadioButton',
  inheritAttrs: false,
  props: {
    label: [String, Number, Boolean],
    value: [String, Number, Boolean],
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        Radio,
        {
          ...attrs,
          value: props.value ?? props.label,
        },
        slots,
      )
  },
})

export const ProgressCompat = defineComponent({
  name: 'AProgress',
  inheritAttrs: false,
  props: {
    percentage: Number,
    percent: Number,
    type: String,
    width: Number,
    strokeWidth: Number,
    color: String,
  },
  setup(props, { attrs }) {
    return () =>
      h(Progress, {
        ...attrs,
        percent: (props.percent ?? props.percentage ?? 0) / 100,
        type: props.type,
        width: props.width,
        strokeWidth: props.strokeWidth,
        color: props.color,
      })
  },
})

export const UploadCompat = defineComponent({
  name: 'AUpload',
  inheritAttrs: false,
  props: {
    accept: String,
    showFileList: Boolean,
    autoUpload: {
      type: Boolean,
      default: true,
    },
    beforeUpload: Function as PropType<(file: File) => boolean | Promise<boolean | File>>,
    httpRequest: Function as PropType<(options: { file: File }) => Promise<unknown> | void>,
    drag: Boolean,
    multiple: Boolean,
    disabled: Boolean,
  },
  setup(props, { attrs, slots }) {
    const customRequest = (option: RequestOption): UploadRequest => {
      if (!props.httpRequest || !option.fileItem.file) {
        option.onSuccess()
        return {}
      }
      Promise.resolve(props.httpRequest({ file: option.fileItem.file }))
        .then((result) => option.onSuccess(result))
        .catch((error) => option.onError(error))
      return {}
    }

    return () =>
      h(
        Upload,
        {
          ...attrs,
          accept: props.accept,
          showFileList: props.showFileList,
          autoUpload: props.autoUpload,
          beforeUpload: props.beforeUpload,
          customRequest,
          draggable: props.drag,
          multiple: props.multiple,
          disabled: props.disabled,
        },
        slots,
      )
  },
})

export const arcoLoadingDirective: Directive<HTMLElement, boolean> = {
  mounted(el, binding) {
    setLoading(el, Boolean(binding.value))
  },
  updated(el, binding) {
    setLoading(el, Boolean(binding.value))
  },
}

function setLoading(el: HTMLElement, loading: boolean): void {
  el.classList.toggle('arco-loading-host', loading)
  let mask = el.querySelector<HTMLElement>(':scope > .arco-loading-mask')
  if (loading && !mask) {
    mask = document.createElement('div')
    mask.className = 'arco-loading-mask'
    mask.innerHTML = '<span class="arco-loading-dot"></span>'
    el.appendChild(mask)
  }
  if (!loading && mask) mask.remove()
}

export function installArcoCompat(app: App): void {
  app.component('AButton', ButtonCompat)
  app.component('ATag', TagCompat)
  app.component('AIcon', IconCompat)
  app.component('ATable', TableCompat)
  app.component('ATableColumn', TableColumnCompat)
  app.component('AForm', FormCompat)
  app.component('AFormItem', FormItemCompat)
  app.component('AInput', InputCompat)
  app.component('ADialog', DialogCompat)
  app.component('ADrawer', DrawerCompat)
  app.component('APagination', PaginationCompat)
  app.component('ATabs', TabsCompat)
  app.component('ATabPane', TabPaneCompat)
  app.component('ASegmented', SegmentedCompat)
  app.component('ARadioButton', RadioButtonCompat)
  app.component('AProgress', ProgressCompat)
  app.component('AUpload', UploadCompat)
  app.directive('loading', arcoLoadingDirective)
}
