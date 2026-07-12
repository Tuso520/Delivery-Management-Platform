import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { ReviewTask } from '@/types/review'
import { canActOnReviewTask } from '../review-presenter'

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
}

function reviewTask(): ReviewTask {
  return {
    id: 'task-1',
    sourceType: 'PROJECT_ARCHIVE',
    sourceId: 'archive-file-1',
    sourceVersionId: 'archive-file-version-1',
    projectId: 'project-1',
    fileVersionId: 'file-version-1',
    title: '竣工验收报告',
    locationLabel: '项目竣工验收报告 / 盖章版',
    status: 'PENDING',
    reviewMode: 'SERIAL',
    currentStepNo: 1,
    totalSteps: 2,
    submittedBy: 'uploader-1',
    submittedAt: '2026-07-11T01:00:00.000Z',
    completedAt: null,
    dueAt: null,
    submitter: { id: 'uploader-1', realName: '上传人' },
    fileVersion: {
      id: 'file-version-1',
      logicalFileId: 'logical-file-1',
      version: 'V1.0',
      versionSequence: 1,
      status: 'IN_REVIEW',
      uploadedAt: '2026-07-11T01:00:00.000Z',
      logicalFile: {
        id: 'logical-file-1',
        currentVersionId: null,
        displayName: '竣工验收报告.pdf',
      },
      asset: {
        id: 'asset-1',
        originalName: '竣工验收报告.pdf',
        extension: 'pdf',
        mimeType: 'application/pdf',
        size: 1024,
      },
    },
    steps: [
      {
        id: 'step-1',
        reviewTaskId: 'task-1',
        stepNo: 1,
        mode: 'SINGLE',
        requiredCount: 1,
        status: 'ACTIVE',
        startedAt: '2026-07-11T01:00:00.000Z',
        completedAt: null,
        assignees: [
          {
            id: 'assignee-1',
            reviewStepId: 'step-1',
            assigneeUserId: 'reviewer-1',
            status: 'PENDING',
            decision: null,
            actedAt: null,
            comment: null,
            assignee: { id: 'reviewer-1', realName: '审核人' },
          },
        ],
      },
    ],
  }
}

describe('unified file review page contract', () => {
  it('shows review actions only for the assigned actor with target permission', () => {
    const task = reviewTask()

    expect(canActOnReviewTask(task, 'reviewer-1', ['file_review:act'])).toBe(true)
    expect(canActOnReviewTask(task, 'reviewer-2', ['file_review:act'])).toBe(false)
    expect(canActOnReviewTask(task, 'reviewer-1', [])).toBe(false)
    expect(
      canActOnReviewTask({ ...task, status: 'APPROVED' }, 'reviewer-1', ['file_review:act']),
    ).toBe(false)
  })

  it('previews the pending FileVersion and contains no legacy review routes', () => {
    const page = source('src/views/review/pending.vue')
    const api = source('src/api/review.ts')
    const dialog = source('src/views/review/components/ReviewDialog.vue')
    const combined = `${page}\n${api}\n${dialog}`

    expect(page).toContain('const fileVersionId = task.fileVersion?.id')
    expect(page).toContain('filePreview.openPreview({')
    expect(page).toContain('id: fileVersionId')
    expect(combined).not.toContain('/reviews/pending')
    expect(combined).not.toMatch(/\/files\/\$\{[^}]+\}\/review/)
    expect(api).toContain('/file-reviews/${taskId}/history')
  })

  it('implements the documented summary, filters, list, drawer and dialog', () => {
    const page = source('src/views/review/pending.vue')

    for (const label of [
      'review.summary.myPending',
      'review.summary.allPending',
      'review.summary.todayAdded',
      'review.summary.overdue',
      'review.reviewStatus',
      'review.columns.location',
      'review.columns.progress',
      'review.detailTitle',
      'review.history',
    ]) {
      expect(page).toContain(label)
    }
    expect(page).toContain('<ReviewDialog')
    expect(page).toContain('firstRouteParam(route.params.taskId)')
    expect(page).toContain("name: 'ReviewDetail'")
  })
})
