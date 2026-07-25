import type { App, Component } from 'vue'
import { defineAsyncComponent } from 'vue'
import Avatar from '@arco-design/web-vue/es/avatar'
import Button from '@arco-design/web-vue/es/button'
import ConfigProvider from '@arco-design/web-vue/es/config-provider'
import Dropdown from '@arco-design/web-vue/es/dropdown'
import Empty from '@arco-design/web-vue/es/empty'
import Menu from '@arco-design/web-vue/es/menu/menu'
import MenuItem from '@arco-design/web-vue/es/menu/item'
import SubMenu from '@arco-design/web-vue/es/menu/sub-menu'
import Table, { TableColumn } from '@arco-design/web-vue/es/table'
import Tooltip from '@arco-design/web-vue/es/tooltip'

type ArcoModule = Record<string, Component> & { default: Component }
type ArcoComponentLoader = () => Promise<ArcoModule>

const criticalComponents: Readonly<Record<string, Component>> = {
  AAvatar: Avatar,
  AButton: Button,
  AConfigProvider: ConfigProvider,
  ADropdown: Dropdown,
  ADoption: Dropdown.Option,
  AEmpty: Empty,
  AMenu: Menu,
  AMenuItem: MenuItem,
  ASubMenu: SubMenu,
  ATable: Table,
  ATableColumn: TableColumn,
  ATooltip: Tooltip,
}

const lazyComponents: Readonly<Record<string, readonly [ArcoComponentLoader, string?]>> = {
  AAlert: [() => import('@arco-design/web-vue/es/alert')],
  ACard: [() => import('@arco-design/web-vue/es/card')],
  ACheckbox: [() => import('@arco-design/web-vue/es/checkbox')],
  ACheckboxGroup: [() => import('@arco-design/web-vue/es/checkbox'), 'CheckboxGroup'],
  ADatePicker: [() => import('@arco-design/web-vue/es/date-picker')],
  ADescriptions: [() => import('@arco-design/web-vue/es/descriptions')],
  ADescriptionsItem: [() => import('@arco-design/web-vue/es/descriptions'), 'DescriptionsItem'],
  ADrawer: [() => import('@arco-design/web-vue/es/drawer')],
  AForm: [() => import('@arco-design/web-vue/es/form')],
  AFormItem: [() => import('@arco-design/web-vue/es/form'), 'FormItem'],
  AGrid: [() => import('@arco-design/web-vue/es/grid')],
  AGridItem: [() => import('@arco-design/web-vue/es/grid'), 'GridItem'],
  AInput: [() => import('@arco-design/web-vue/es/input')],
  AInputNumber: [() => import('@arco-design/web-vue/es/input-number')],
  AInputTag: [() => import('@arco-design/web-vue/es/input-tag')],
  AModal: [() => import('@arco-design/web-vue/es/modal')],
  AOption: [() => import('@arco-design/web-vue/es/select'), 'Option'],
  APagination: [() => import('@arco-design/web-vue/es/pagination')],
  AProgress: [() => import('@arco-design/web-vue/es/progress')],
  ARadio: [() => import('@arco-design/web-vue/es/radio')],
  ARadioGroup: [() => import('@arco-design/web-vue/es/radio'), 'RadioGroup'],
  AResult: [() => import('@arco-design/web-vue/es/result')],
  ASelect: [() => import('@arco-design/web-vue/es/select')],
  ASkeleton: [() => import('@arco-design/web-vue/es/skeleton')],
  ASkeletonLine: [() => import('@arco-design/web-vue/es/skeleton'), 'SkeletonLine'],
  ASpace: [() => import('@arco-design/web-vue/es/space')],
  ASpin: [() => import('@arco-design/web-vue/es/spin')],
  ASwitch: [() => import('@arco-design/web-vue/es/switch')],
  ATag: [() => import('@arco-design/web-vue/es/tag')],
  ATextarea: [() => import('@arco-design/web-vue/es/textarea')],
  ATimeline: [() => import('@arco-design/web-vue/es/timeline')],
  ATimelineItem: [() => import('@arco-design/web-vue/es/timeline'), 'TimelineItem'],
  ATreeSelect: [() => import('@arco-design/web-vue/es/tree-select')],
  AUpload: [() => import('@arco-design/web-vue/es/upload')],
}

export function installArcoComponents(app: App): void {
  Object.entries(criticalComponents).forEach(([name, component]) => {
    app.component(name, component)
  })

  Object.entries(lazyComponents).forEach(([name, [loader, exportName]]) => {
    app.component(
      name,
      defineAsyncComponent(async () => {
        const module = await loader()
        return exportName ? module[exportName] : module.default
      }),
    )
  })
}
