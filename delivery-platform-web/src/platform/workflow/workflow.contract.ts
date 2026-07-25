import type {
  ApprovalBusinessType,
  ApprovalTemplate,
} from '../approval/approval.types'
import type { ReviewSourceType, ReviewTask } from '../approval/review.types'

export interface WorkflowSubmission {
  sourceType: ReviewSourceType
  sourceId: string
  sourceVersionId?: string
  approvalTemplateId?: string
}

export interface WorkflowGateway {
  findTemplate(businessType: ApprovalBusinessType): Promise<ApprovalTemplate | null>
  submit(input: WorkflowSubmission): Promise<ReviewTask>
}
