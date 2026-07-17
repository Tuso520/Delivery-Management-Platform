/* eslint-disable vue/one-component-per-file, vue/require-default-prop */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, type PropType } from 'vue'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUserStore } from '@/store/user'

import BusinessDrawer from '../BusinessDrawer.vue'
import BusinessTable from '../BusinessTable.vue'
import Can from '../Can.vue'
import StatusBadge from '../StatusBadge.vue'

vi.mock('@/router', () => ({
  default: { push: vi.fn() },
}))

const TableStub = defineComponent({
  name: 'ATable',
  props: {
    data: { type: Array as PropType<Array<Record<string, unknown>>>, default: () => [] },
    loading: Boolean,
    rowKey: { type: String, default: '' },
    pagination: { type: [Boolean, Object] as PropType<boolean | Record<string, unknown>> },
    scroll: { type: Object as PropType<Record<string, unknown>>, default: () => ({}) },
    columns: Array as PropType<Array<Record<string, unknown>>>,
    size: { type: String, default: 'medium' },
    showHeader: { type: Boolean, default: true },
    bordered: Boolean,
    stripe: Boolean,
    defaultExpandAllRows: Boolean,
  },
  template: `
    <div data-testid="table">
      <slot />
      <slot name="empty" />
    </div>
  `,
})

const ErrorStateStub = defineComponent({
  name: 'ErrorState',
  props: { title: String, retryLabel: String },
  emits: ['retry'],
  template: `
    <div data-testid="error-state">
      <span>{{ title }}</span>
      <button data-testid="retry" @click="$emit('retry')">{{ retryLabel }}</button>
    </div>
  `,
})

const EmptyStateStub = defineComponent({
  name: 'EmptyState',
  props: { title: String, description: String },
  template: '<div data-testid="empty-state">{{ title }} {{ description }}</div>',
})

const DrawerStub = defineComponent({
  name: 'ADrawer',
  props: {
    visible: Boolean,
    title: String,
    width: String,
    footer: Boolean,
    unmountOnClose: Boolean,
    maskClosable: Boolean,
  },
  emits: ['update:visible', 'cancel', 'ok'],
  template: `
    <aside data-testid="drawer">
      <header><slot name="title">{{ title }}</slot></header>
      <main><slot /></main>
      <footer v-if="footer"><slot name="footer" /></footer>
      <button data-testid="close" @click="$emit('update:visible', false)">close</button>
      <button data-testid="cancel" @click="$emit('cancel')">cancel</button>
      <button data-testid="ok" @click="$emit('ok')">ok</button>
    </aside>
  `,
})

const TagStub = defineComponent({
  name: 'ATag',
  props: { color: String, bordered: Boolean },
  template: '<span data-testid="status-tag"><slot /></span>',
})

describe('BusinessTable mount contract', () => {
  const global = {
    stubs: {
      ATable: TableStub,
      ASpin: true,
      ErrorState: ErrorStateStub,
      EmptyState: EmptyStateStub,
    },
  }

  it('forwards table state and loads remote pages near the container bottom', async () => {
    const data = Array.from({ length: 20 }, (_, index) => ({
      id: `row-${index + 1}`,
      name: `项目 ${index + 1}`,
    }))
    const columns = [{ title: '项目名称', dataIndex: 'name' }]
    const wrapper = mount(BusinessTable, {
      props: {
        data,
        loading: false,
        rowKey: 'id',
        columns,
        size: 'small',
        showHeader: false,
        bordered: true,
        stripe: true,
        pagination: { page: 1, pageSize: 20, total: 40 },
      },
      attrs: { 'data-source': 'project-list' },
      global,
    })

    const table = wrapper.getComponent(TableStub)
    expect(table.props()).toMatchObject({
      data,
      loading: false,
      rowKey: 'id',
      columns,
      size: 'small',
      showHeader: false,
      pagination: false,
      bordered: true,
      stripe: true,
      scroll: { x: 'max-content' },
    })
    expect(table.attributes('data-source')).toBe('project-list')

    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(false)

    const viewport = wrapper.get('.business-table__viewport')
    Object.defineProperties(viewport.element, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 420 },
    })
    await viewport.trigger('scroll')
    expect(wrapper.emitted('pageChange')).toEqual([[2]])

    const secondPage = Array.from({ length: 20 }, (_, index) => ({
      id: `row-${index + 21}`,
      name: `项目 ${index + 21}`,
    }))
    await wrapper.setProps({
      data: secondPage,
      pagination: { page: 2, pageSize: 20, total: 40 },
    })
    expect(wrapper.getComponent(TableStub).props('data')).toHaveLength(40)
    await viewport.trigger('scroll')
    expect(wrapper.emitted('pageChange')).toEqual([[2]])
  })

  it('reveals local rows in batches of twenty', async () => {
    const data = Array.from({ length: 45 }, (_, index) => ({ id: `row-${index + 1}` }))
    const wrapper = mount(BusinessTable, { props: { data }, global })
    const viewport = wrapper.get('.business-table__viewport')

    expect(wrapper.getComponent(TableStub).props('data')).toHaveLength(20)
    Object.defineProperties(viewport.element, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 420 },
    })
    await viewport.trigger('scroll')
    expect(wrapper.getComponent(TableStub).props('data')).toHaveLength(40)
    await viewport.trigger('scroll')
    expect(wrapper.getComponent(TableStub).props('data')).toHaveLength(45)
  })

  it('converts declarative column children into the columns contract', () => {
    const DeclarativeColumn = defineComponent({
      name: 'TableColumn',
      setup:
        (_props, { slots }) =>
        () =>
          slots.default?.(),
    })
    const wrapper = mount(BusinessTable, {
      props: { data: [{ id: 'row-1' }] },
      slots: {
        default: () =>
          h(
            DeclarativeColumn,
            { title: '项目名称', 'data-index': 'name', 'min-width': 220 },
            { cell: () => h('span', { 'data-testid': 'declarative-cell' }, '项目 A') },
          ),
      },
      global,
    })

    const table = wrapper.getComponent(TableStub)
    const columns = table.props('columns') as Array<{
      title: string
      dataIndex: string
      minWidth: number
      slots: { cell: () => unknown }
    }>
    expect(columns).toHaveLength(1)
    const column = columns[0]
    expect(column).toBeDefined()
    expect(column).toMatchObject({ title: '项目名称', dataIndex: 'name', minWidth: 220 })
    expect(column?.slots.cell()).toEqual(expect.objectContaining({ type: 'span' }))
  })

  it('supports the legacy named columns slot without forwarding it to Arco Table', () => {
    const DeclarativeColumn = defineComponent({ name: 'TableColumn', template: '<span />' })
    const wrapper = mount(BusinessTable, {
      props: { data: [{ id: 'row-1', name: '项目 A' }] },
      slots: {
        columns: () => h(DeclarativeColumn, { title: '名称', 'data-index': 'name' }),
      },
      global,
    })

    const columns = wrapper.getComponent(TableStub).props('columns') as Array<{
      title: string
      dataIndex: string
    }>
    expect(columns).toEqual([expect.objectContaining({ title: '名称', dataIndex: 'name' })])
  })

  it('renders an error instead of a table and relays retry', async () => {
    const wrapper = mount(BusinessTable, {
      props: {
        data: [],
        error: new Error('项目列表加载失败'),
        retryLabel: '重试',
      },
      global,
    })

    expect(wrapper.findComponent(TableStub).exists()).toBe(false)
    expect(wrapper.get('[data-testid="error-state"]').text()).toContain('项目列表加载失败')
    await wrapper.get('[data-testid="retry"]').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})

describe('BusinessDrawer mount contract', () => {
  it('maps semantic sizes, renders slots and relays drawer actions', async () => {
    const wrapper = mount(BusinessDrawer, {
      props: { visible: true, title: '项目详情', size: 'lg' },
      slots: {
        title: '<strong data-testid="drawer-title">档案详情</strong>',
        default: '<section data-testid="drawer-content">内容</section>',
        footer: '<span data-testid="drawer-footer">操作</span>',
      },
      global: { stubs: { ADrawer: DrawerStub } },
    })

    const drawer = wrapper.getComponent(DrawerStub)
    expect(drawer.props()).toMatchObject({
      visible: true,
      width: '960px',
      footer: true,
      unmountOnClose: true,
      maskClosable: true,
    })
    expect(wrapper.get('[data-testid="drawer-title"]').text()).toBe('档案详情')
    expect(wrapper.get('[data-testid="drawer-content"]').text()).toBe('内容')
    expect(wrapper.get('[data-testid="drawer-footer"]').text()).toBe('操作')

    await wrapper.get('[data-testid="close"]').trigger('click')
    await wrapper.get('[data-testid="cancel"]').trigger('click')
    await wrapper.get('[data-testid="ok"]').trigger('click')
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('ok')).toHaveLength(1)
  })
})

describe('StatusBadge mount contract', () => {
  function mountBadge(props: { domain: 'project'; status: string; label?: string }) {
    const i18n = createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': { status: { ACTIVE: '进行中' } } },
    })
    return mount(StatusBadge, {
      props,
      global: { plugins: [i18n], stubs: { ATag: TagStub } },
    })
  }

  it('uses the status registry color and translated label', () => {
    const wrapper = mountBadge({ domain: 'project', status: 'ACTIVE' })

    expect(wrapper.getComponent(TagStub).props('color')).toBe('green')
    expect(wrapper.get('[data-testid="status-tag"]').text()).toBe('进行中')
  })

  it('falls back safely and allows an explicit label', () => {
    const unknown = mountBadge({ domain: 'project', status: 'UNKNOWN' })
    const labelled = mountBadge({ domain: 'project', status: 'UNKNOWN', label: '待确认' })

    expect(unknown.getComponent(TagStub).props('color')).toBe('gray')
    expect(unknown.text()).toContain('UNKNOWN')
    expect(labelled.text()).toContain('待确认')
  })
})

describe('Can mount contract', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  function mountCan(
    props: {
      permission?: string
      any?: string[]
      all?: string[]
      disabled?: boolean
      reason?: string
    },
    roles: string[] = ['PROJECT_MANAGER'],
    permissions: string[] = ['project:view', 'file:view'],
  ) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const userStore = useUserStore()
    userStore.$patch({
      userInfo: {
        id: 'user-1',
        username: 'manager',
        realName: '项目经理',
        email: 'manager@example.com',
        roles,
        permissions,
      },
    })
    return mount(Can, {
      props,
      slots: {
        default: (slotProps: Record<string, unknown>) =>
          h(
            'button',
            {
              'data-testid': 'allowed',
              'data-reason': String(slotProps.reason ?? ''),
              disabled: Boolean(slotProps.disabled),
            },
            '允许',
          ),
        denied: '<span data-testid="denied">无权限</span>',
      },
      global: { plugins: [pinia] },
    })
  }

  it('renders the scoped default slot when the permission is granted', () => {
    const wrapper = mountCan({
      permission: 'project:view',
      disabled: true,
      reason: '项目已归档',
    })

    const allowed = wrapper.get<HTMLButtonElement>('[data-testid="allowed"]')
    expect(allowed.element.disabled).toBe(true)
    expect(allowed.attributes('data-reason')).toBe('项目已归档')
    expect(wrapper.find('[data-testid="denied"]').exists()).toBe(false)
  })

  it('renders the denied slot unless all requested permissions are granted', () => {
    const wrapper = mountCan({ all: ['project:view', 'project:delete'] })

    expect(wrapper.find('[data-testid="allowed"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="denied"]').text()).toBe('无权限')
  })

  it('keeps the SUPER_ADMIN permission override as the only role-based exception', () => {
    const wrapper = mountCan({ permission: 'system:unknown' }, ['SUPER_ADMIN'], [])

    expect(wrapper.get('[data-testid="allowed"]').text()).toBe('允许')
  })
})
