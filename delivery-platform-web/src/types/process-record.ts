export interface ProjectProcessRecord {
  id: string
  projectId: string
  title: string
  recordType: 'Progress' | 'Meeting' | 'Inspection' | 'Delivery' | 'Issue' | 'Other'
  stageCode?: string
  recordDate: string
  description?: string
  status: string
  createdAt: string
  project: { id: string; projectCode: string; projectName: string }
  creator: { id: string; realName: string }
}

export interface ProcessRecordPayload {
  projectId: string
  title: string
  recordType: ProjectProcessRecord['recordType']
  stageCode?: string
  recordDate: string
  description?: string
}

export const PROCESS_RECORD_TYPE_OPTIONS = [
  { value: 'Progress', label: '进度记录' },
  { value: 'Meeting', label: '会议记录' },
  { value: 'Inspection', label: '现场记录' },
  { value: 'Delivery', label: '交付记录' },
  { value: 'Issue', label: '问题记录' },
  { value: 'Other', label: '其他记录' },
] as const
