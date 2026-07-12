import request from './request'
import type { PaginationParams } from '@/types/api'
import type {
  ApprovalTemplate,
  ApprovalTemplatePage,
  SaveApprovalTemplateDto,
} from '@/types/settings'

export interface QueryApprovalTemplateParams extends PaginationParams {
  keyword?: string
  businessType?: string
  enabled?: boolean
}

export const approvalTemplateApi = {
  getList(params: QueryApprovalTemplateParams) {
    return request.get<ApprovalTemplatePage>('/approval-templates', { params })
  },

  create(data: SaveApprovalTemplateDto) {
    return request.post<ApprovalTemplate>('/approval-templates', data)
  },

  update(id: string, data: Partial<SaveApprovalTemplateDto>) {
    return request.patch<ApprovalTemplate>(`/approval-templates/${id}`, data)
  },

  delete(id: string) {
    return request.delete<void>(`/approval-templates/${id}`)
  },

  toggle(id: string) {
    return request.post<ApprovalTemplate>(`/approval-templates/${id}/toggle`)
  },
}
