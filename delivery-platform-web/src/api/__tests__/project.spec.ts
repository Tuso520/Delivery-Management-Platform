import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: mocks,
}))

import { projectApi } from '@/api/project'

describe('projectApi refactored contract', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  it('loads summary and the overview list with the documented query contract', () => {
    const params = {
      keyword: '上海',
      summaryFilter: 'ACTIVE' as const,
      page: 2,
      pageSize: 20,
      sort: 'updatedAt:desc' as const,
    }

    projectApi.getSummary()
    projectApi.getList(params)

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/projects/summary')
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/projects', { params })
  })

  it('uses PATCH for ordinary edits and never falls back to PUT', () => {
    const payload = { revision: 7, projectName: '上海交付中心', progressPercent: 35 }

    projectApi.update('project-1', payload)

    expect(mocks.patch).toHaveBeenCalledWith('/projects/project-1', payload)
  })

  it('uses dedicated stage and acceptance commands', () => {
    projectApi.updateStage('project-1', {
      revision: 7,
      targetStage: 'CONSTRUCTION',
      reason: '现场计划调整',
    })
    projectApi.updateAcceptance('project-1', {
      revision: 8,
      actualAcceptanceAt: '2026-07-11',
      reason: '客户完成验收',
    })

    expect(mocks.patch).toHaveBeenNthCalledWith(1, '/projects/project-1/stage', {
      revision: 7,
      targetStage: 'CONSTRUCTION',
      reason: '现场计划调整',
    })
    expect(mocks.patch).toHaveBeenNthCalledWith(2, '/projects/project-1/acceptance', {
      revision: 8,
      actualAcceptanceAt: '2026-07-11',
      reason: '客户完成验收',
    })
  })

  it.each(['pause', 'resume', 'complete', 'cancel', 'archive', 'restore'] as const)(
    'uses the dedicated %s status command',
    (command) => {
      projectApi.changeStatus('project-1', command, { revision: 9, reason: '状态说明' })

      expect(mocks.post).toHaveBeenCalledWith(`/projects/project-1/${command}`, {
        revision: 9,
        reason: '状态说明',
      })
    },
  )

  it('requires and sends the project-create idempotency key', () => {
    const payload = {
      projectName: '上海交付中心',
      countryCode: 'CN',
      archiveTemplateId: 'archive-template-1',
    }

    projectApi.create(payload, 'project-create-draft-001')

    expect(mocks.post).toHaveBeenCalledWith('/projects', payload, {
      headers: { 'Idempotency-Key': 'project-create-draft-001' },
    })
  })

  it('loads minimal user references by business purpose', () => {
    projectApi.getUserOptions('project-manager')

    expect(mocks.get).toHaveBeenCalledWith('/references/users', {
      params: { purpose: 'project-manager' },
    })
  })

  it('uses a silent DELETE so the page can preserve and surface dependency blockers verbatim', () => {
    projectApi.delete('project-1')

    expect(mocks.delete).toHaveBeenCalledWith('/projects/project-1', { silent: true })
  })
})
