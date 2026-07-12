export interface OperationLog {
  id: string
  userId: string
  module: string
  action: string
  targetType: string
  targetId: string
  beforeData: unknown
  afterData: unknown
  ipAddress: string | null
  userAgent: string | null
  result: string
  traceId: string | null
  errorReason: string | null
  createdAt: string
  user: {
    id: string
    username: string
    realName: string
  } | null
}
