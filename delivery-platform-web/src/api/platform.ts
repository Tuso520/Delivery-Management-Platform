import request from './request'
import type {
  ApprovalTask,
  ApprovalTemplate,
  BackupRecord,
  DepartmentNode,
  DictionaryCategory,
  ExternalContactCandidate,
  IntegrationConfig,
  PlatformPage,
  ProjectRetrospective,
  RoleOption,
  SkillDefinition,
  StorageStatus,
  TrainingPlan,
} from '@/types/platform'

interface QueryParams {
  page?: number
  pageSize?: number
  keyword?: string
  status?: string
  businessType?: string
}

export const dictionaryApi = {
  getAll: () => request.get<DictionaryCategory[]>('/dictionaries'),
  getByCode: (code: string) => request.get<DictionaryCategory>(`/dictionaries/${code}`),
}

export const referenceApi = {
  getRoleOptions: () => request.get<RoleOption[]>('/references/roles'),
}

export const departmentApi = {
  getTree: () => request.get<DepartmentNode[]>('/departments'),
  create: (data: Record<string, unknown>) => request.post<DepartmentNode>('/departments', data),
  update: (id: string, data: Record<string, unknown>) =>
    request.put<DepartmentNode>(`/departments/${id}`, data),
  deactivate: (id: string) => request.delete<void>(`/departments/${id}`),
}

export const approvalApi = {
  getTemplates: (params: QueryParams) =>
    request.get<PlatformPage<ApprovalTemplate>>('/approvals/templates', { params }),
  saveTemplate: (data: Record<string, unknown>) =>
    request.post<ApprovalTemplate>('/approvals/templates', data),
  getTasks: (params: QueryParams) =>
    request.get<PlatformPage<ApprovalTask>>('/approvals/tasks', { params }),
  decide: (id: string, data: { decision: string; comment?: string }) =>
    request.post<ApprovalTask>(`/approvals/tasks/${id}/decision`, data),
}

export const workforceApi = {
  getSkills: (params: QueryParams) =>
    request.get<PlatformPage<SkillDefinition>>('/workforce/skills', { params }),
  saveSkill: (data: Record<string, unknown>) =>
    request.post<SkillDefinition>('/workforce/skills', data),
  assessSkill: (data: Record<string, unknown>) =>
    request.post('/workforce/skill-assessments', data),
  getTraining: (params: QueryParams) =>
    request.get<PlatformPage<TrainingPlan>>('/workforce/training', { params }),
  createTraining: (data: Record<string, unknown>) =>
    request.post<TrainingPlan>('/workforce/training', data),
  updateTraining: (id: string, data: Record<string, unknown>) =>
    request.put<TrainingPlan>(`/workforce/training/${id}`, data),
  completeTraining: (id: string) =>
    request.post<TrainingPlan>(`/workforce/training/${id}/complete`),
  addParticipant: (id: string, data: Record<string, unknown>) =>
    request.post(`/workforce/training/${id}/participants`, data),
  signTraining: (id: string) => request.post(`/workforce/training/${id}/sign`),
}

export const retrospectiveApi = {
  getList: (params: QueryParams) =>
    request.get<PlatformPage<ProjectRetrospective>>('/retrospectives', { params }),
  create: (data: Record<string, unknown>) =>
    request.post<ProjectRetrospective>('/retrospectives', data),
  update: (id: string, data: Record<string, unknown>) =>
    request.put<ProjectRetrospective>(`/retrospectives/${id}`, data),
  addAction: (id: string, data: Record<string, unknown>) =>
    request.post(`/retrospectives/${id}/actions`, data),
  updateAction: (id: string, data: Record<string, unknown>) =>
    request.put(`/retrospectives/actions/${id}`, data),
}

export const systemOperationsApi = {
  getStorage: () => request.get<StorageStatus>('/system-operations/storage'),
  getBackups: (params: QueryParams) =>
    request.get<PlatformPage<BackupRecord>>('/system-operations/backups', { params }),
  createBackup: () =>
    request.post<BackupRecord>('/system-operations/backups', { backupType: 'database' }),
  downloadBackup: (id: string) =>
    request.get<Blob>(`/system-operations/backups/${id}/download`, {
      responseType: 'blob',
      timeout: 120000,
    }),
  getIntegrations: () =>
    request.get<IntegrationConfig[]>('/system-operations/integrations'),
  createIntegration: (data: Record<string, unknown>) =>
    request.post<IntegrationConfig>('/system-operations/integrations', data),
  updateIntegration: (id: string, data: Record<string, unknown>) =>
    request.patch<IntegrationConfig>(`/system-operations/integrations/${id}`, data),
  toggleIntegration: (id: string, enabled: boolean) =>
    request.patch<IntegrationConfig>(`/system-operations/integrations/${id}/enabled/${enabled}`),
  syncExternalContacts: (id: string) =>
    request.post<{ provider: string; total: number; created: number; refreshed: number }>(
      `/system-operations/integrations/${id}/sync-users`,
    ),
  getExternalContacts: (id: string, status?: string) =>
    request.get<ExternalContactCandidate[]>(
      `/system-operations/integrations/${id}/contact-candidates`,
      { params: { status } },
    ),
  approveExternalContact: (
    id: string,
    candidateId: string,
    data: { roleIds: string[]; departmentId?: string; positions?: string[]; username?: string; comment?: string },
  ) =>
    request.post<ExternalContactCandidate>(
      `/system-operations/integrations/${id}/contact-candidates/${candidateId}/approve`,
      data,
    ),
  rejectExternalContact: (id: string, candidateId: string, data: { comment?: string }) =>
    request.post<ExternalContactCandidate>(
      `/system-operations/integrations/${id}/contact-candidates/${candidateId}/reject`,
      data,
    ),
}
