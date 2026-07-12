import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: mocks,
}))

import { normalizeReviewSummary, reviewApi } from '@/api/review'

describe('reviewApi unified task contract', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  it('uses the target summary, paginated list, detail and immutable history endpoints', async () => {
    mocks.get.mockResolvedValueOnce({
      myPending: 2,
      allPending: 5,
      todayAdded: 1,
      overdue: 1,
    })
    const params = { page: 2, pageSize: 20, keyword: '验收', status: 'PENDING' as const }

    await reviewApi.getSummary()
    reviewApi.getList(params)
    reviewApi.getById('task-1')
    reviewApi.getHistory('task-1')

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/file-reviews/summary')
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/file-reviews', { params })
    expect(mocks.get).toHaveBeenNthCalledWith(3, '/file-reviews/task-1')
    expect(mocks.get).toHaveBeenNthCalledWith(4, '/file-reviews/task-1/history')
  })

  it('uses task IDs for approve and reject actions', () => {
    reviewApi.approve('task-1', { comment: '内容准确' })
    reviewApi.reject('task-2', { comment: '版本号不一致' })

    expect(mocks.post).toHaveBeenNthCalledWith(
      1,
      '/file-reviews/task-1/approve',
      { comment: '内容准确' },
    )
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      '/file-reviews/task-2/reject',
      { comment: '版本号不一致' },
    )
  })

  it('narrowly normalizes the transitional summary response', () => {
    expect(normalizeReviewSummary({ pending: 3, approved: 8, rejected: 1, total: 12 })).toEqual({
      myPending: 3,
      allPending: 3,
      todayAdded: 0,
      overdue: 0,
    })
  })
})
