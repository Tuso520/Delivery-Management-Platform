import request from './request'
import type { FileReview, PendingReview } from '@/types/file'

export const reviewApi = {
  /**
   * 获取当前用户待审核列表
   */
  getPending() {
    return request.get<PendingReview[]>('/reviews/pending')
  },

  /**
   * 对文件发起审核
   */
  reviewFile(fileId: string, data: { comment?: string }) {
    return request.post<FileReview>(`/files/${fileId}/review`, data)
  },

  /**
   * 获取文件的审核历史
   */
  getFileReviews(fileId: string) {
    return request.get<FileReview[]>(`/files/${fileId}/reviews`)
  },

  /**
   * 审核通过
   */
  approve(fileId: string, comment?: string) {
    return request.post<void>(`/files/${fileId}/review/approve`, { comment })
  },

  /**
   * 审核驳回
   */
  reject(fileId: string, comment?: string) {
    return request.post<void>(`/files/${fileId}/review/reject`, { comment })
  },
}
