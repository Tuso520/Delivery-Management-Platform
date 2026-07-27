import { computed, readonly, ref, shallowRef, type ShallowRef } from 'vue'

import { fieldOptionsApi } from '@/api/field-configuration'
import type { FieldConfiguration, FieldOption } from '@/types/field-configuration'

interface ModuleFieldState {
  fields: ShallowRef<FieldConfiguration[]>
  loaded: boolean
  pending: Promise<FieldConfiguration[]> | null
}

const moduleStates = new Map<string, ModuleFieldState>()

function normalizeModuleCode(moduleCode: string): string {
  return moduleCode.trim().toLowerCase()
}

function getModuleState(moduleCode: string): ModuleFieldState {
  const normalizedCode = normalizeModuleCode(moduleCode)
  const existing = moduleStates.get(normalizedCode)
  if (existing) return existing
  const state: ModuleFieldState = {
    fields: shallowRef<FieldConfiguration[]>([]),
    loaded: false,
    pending: null,
  }
  moduleStates.set(normalizedCode, state)
  return state
}

async function loadModuleFields(moduleCode: string, force = false): Promise<FieldConfiguration[]> {
  const normalizedCode = normalizeModuleCode(moduleCode)
  const state = getModuleState(normalizedCode)
  if (state.loaded && !force) return state.fields.value
  if (state.pending && !force) return state.pending

  const pending = fieldOptionsApi.getByModule(normalizedCode)
    .then((fields) => {
      state.fields.value = [...fields].sort((left, right) => left.sort - right.sort)
      state.loaded = true
      return state.fields.value
    })
    .finally(() => {
      state.pending = null
    })
  state.pending = pending
  return pending
}

export function invalidateFieldConfigCache(moduleCode?: string): void {
  if (moduleCode) {
    const state = moduleStates.get(normalizeModuleCode(moduleCode))
    if (state) state.loaded = false
    return
  }
  moduleStates.forEach((state) => {
    state.loaded = false
  })
}

export function useFieldConfig(moduleCode: string) {
  const state = getModuleState(moduleCode)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const fieldsByCode = computed(
    () => new Map(state.fields.value.map((field) => [field.fieldCode, field])),
  )

  async function load(force = false): Promise<FieldConfiguration[]> {
    loading.value = true
    error.value = null
    try {
      return await loadModuleFields(moduleCode, force)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '字段配置加载失败'
      throw cause
    } finally {
      loading.value = false
    }
  }

  function getField(fieldCode: string): FieldConfiguration | undefined {
    return fieldsByCode.value.get(fieldCode.toUpperCase())
  }

  function getFieldOptions(fieldCode: string, includeDisabled = false): FieldOption[] {
    const options = getField(fieldCode)?.options ?? []
    return includeDisabled ? options : options.filter((option) => option.enabled)
  }

  function getFieldLabel(fieldCode: string, value?: string | null): string {
    if (!value) return ''
    return getFieldOptions(fieldCode, true).find((option) => option.value === value)?.label ?? value
  }

  function isFieldRequired(fieldCode: string): boolean {
    return getField(fieldCode)?.required ?? false
  }

  function isFieldEnabled(fieldCode: string): boolean {
    return getField(fieldCode)?.enabled ?? false
  }

  void load()

  return {
    fields: readonly(state.fields),
    loading: readonly(loading),
    error: readonly(error),
    load,
    refresh: () => load(true),
    getField,
    getFieldOptions,
    getFieldLabel,
    isFieldRequired,
    isFieldEnabled,
  }
}
