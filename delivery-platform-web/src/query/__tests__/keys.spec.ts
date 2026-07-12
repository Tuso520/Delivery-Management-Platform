import { describe, expect, it } from 'vitest'

import { queryKeys } from '@/query/keys'

describe('administration query keys', () => {
  it('keeps each administration resource in an isolated namespace', () => {
    expect(queryKeys.auth.publicConfig()).toEqual(['auth', 'public-config'])
    expect(queryKeys.currencies.list()).toEqual(['currencies', 'list'])
    expect(queryKeys.roles.detail('role-1')).toEqual(['roles', 'detail', 'role-1'])
    expect(queryKeys.permissions.groups()).toEqual(['permissions', 'groups'])
    expect(queryKeys.departments.tree()).toEqual(['departments', 'tree'])
  })

  it('snapshots user filters so later form edits cannot mutate an existing cache key', () => {
    const params = { page: 1, pageSize: 20, keyword: 'alice' }
    const key = queryKeys.users.list(params)

    params.page = 2
    params.keyword = 'bob'

    expect(key).toEqual(['users', 'list', { page: 1, pageSize: 20, keyword: 'alice' }])
  })
})
