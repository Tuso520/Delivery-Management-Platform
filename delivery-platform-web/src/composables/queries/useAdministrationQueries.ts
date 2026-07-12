import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { currencyApi } from '@/api/currency'
import { permissionApi } from '@/api/permission'
import { departmentApi } from '@/api/platform'
import { roleApi } from '@/api/role'
import { systemConfigApi } from '@/api/system'
import { userApi } from '@/api/user'
import { queryKeys } from '@/query/keys'
import type { QueryUserParams } from '@/types/user'

export function usePublicSystemConfigQuery() {
  return useQuery({
    queryKey: queryKeys.auth.publicConfig(),
    queryFn: systemConfigApi.getPublic,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCurrenciesQuery() {
  return useQuery({ queryKey: queryKeys.currencies.list(), queryFn: currencyApi.getList })
}

export function useUsersQuery(
  params: MaybeRefOrGetter<QueryUserParams>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  return useQuery({
    queryKey: computed(() => queryKeys.users.list(toValue(params))),
    queryFn: () => userApi.getList({ ...toValue(params) }),
    enabled: computed(() => toValue(enabled)),
  })
}

export function useRolesQuery(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: roleApi.getList,
    enabled: computed(() => toValue(enabled)),
  })
}

export function useRoleDetailQuery(
  roleId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  return useQuery({
    queryKey: computed(() => queryKeys.roles.detail(toValue(roleId))),
    queryFn: () => roleApi.getById(toValue(roleId)),
    enabled: computed(() => Boolean(toValue(roleId)) && toValue(enabled)),
  })
}

export function usePermissionGroupsQuery(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: queryKeys.permissions.groups(),
    queryFn: permissionApi.getAll,
    enabled: computed(() => toValue(enabled)),
  })
}

export function useDepartmentsQuery() {
  return useQuery({ queryKey: queryKeys.departments.tree(), queryFn: departmentApi.getTree })
}
