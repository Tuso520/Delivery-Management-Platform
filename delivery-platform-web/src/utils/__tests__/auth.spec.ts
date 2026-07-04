import { beforeEach, describe, expect, it } from 'vitest'

import {
  getUserInfo,
  setUserInfo,
} from '../auth'
import type { UserInfo } from '@/types/user'

const user: UserInfo = {
  id: 'user-1',
  username: 'admin',
  realName: '系统管理员',
  email: 'admin@example.com',
  roles: ['SUPER_ADMIN'],
  permissions: [],
}

describe('auth user cache', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('invalidates the legacy unversioned user cache', () => {
    localStorage.setItem('delivery_user_info', JSON.stringify(user))

    expect(getUserInfo()).toBeNull()
    expect(localStorage.getItem('delivery_user_info')).toBeNull()
  })

  it('round-trips the current versioned user cache', () => {
    setUserInfo(user)

    expect(getUserInfo()).toEqual(user)
    expect(JSON.parse(localStorage.getItem('delivery_user_info') ?? '{}')).toMatchObject({
      version: 2,
      user,
    })
  })

  it('invalidates a cache with malformed role or permission data', () => {
    localStorage.setItem('delivery_user_info', JSON.stringify({
      version: 2,
      user: {
        ...user,
        roles: 'SUPER_ADMIN',
      },
    }))

    expect(getUserInfo()).toBeNull()
    expect(localStorage.getItem('delivery_user_info')).toBeNull()
  })
})
