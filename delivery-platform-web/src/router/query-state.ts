import type { LocationQuery, LocationQueryRaw } from 'vue-router'

export function firstRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

export function preservedRouteQuery(
  query: LocationQuery,
  transientKeys: readonly string[] = [],
): LocationQueryRaw {
  const transient = new Set(transientKeys)
  return Object.fromEntries(
    Object.entries(query).filter(([key, value]) => !transient.has(key) && value != null),
  )
}
