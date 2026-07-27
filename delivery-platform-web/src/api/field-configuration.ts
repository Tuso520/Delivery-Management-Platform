import request from './request'
import type { PaginatedData } from '@/types/api'
import type {
  EnabledFieldOptions,
  FieldCategory,
  FieldConfiguration,
  FieldConfigurationVersion,
  FieldReferenceStatus,
  FieldValue,
  SaveFieldConfigurationDto,
  SaveFieldValueDto,
} from '@/types/field-configuration'

export const fieldConfigurationApi = {
  getAll: (params?: { moduleCode?: string; includeDisabled?: boolean }) =>
    request.get<FieldConfiguration[]>('/field-config', { params }),
  getByModule: (moduleCode: string, includeDisabled = false) =>
    request.get<FieldConfiguration[]>(`/field-config/module/${moduleCode}`, {
      params: { includeDisabled },
    }),
  getVersion: () => request.get<FieldConfigurationVersion>('/field-config/version'),
  checkCode: (fieldCode: string, excludeId?: string) =>
    request.get<{ fieldCode: string; available: boolean }>('/field-config/code-availability', {
      params: { fieldCode, excludeId },
    }),
  createField: (data: SaveFieldConfigurationDto) =>
    request.post<FieldConfiguration>('/field-config', data),
  updateField: (id: string, data: Partial<SaveFieldConfigurationDto>) =>
    request.patch<FieldConfiguration>(`/field-config/${id}`, data),
  changeFieldStatus: (id: string, enabled: boolean) =>
    request.patch<FieldConfiguration>(`/field-config/${id}/status`, { enabled }),
  sortFields: (items: Array<{ id: string; sort: number }>) =>
    request.put<FieldConfiguration[]>('/field-config/sort', { items }),
  getCategories: () => request.get<FieldCategory[]>('/field-config/categories'),
  getValues: (
    categoryId: string,
    params: { page: number; pageSize: number; keyword?: string; status?: FieldValue['status'] },
  ) => request.get<PaginatedData<FieldValue>>(`/field-config/categories/${categoryId}/values`, { params }),
  create: (categoryId: string, data: SaveFieldValueDto) => request.post<FieldValue>(`/field-config/categories/${categoryId}/values`, data),
  update: (id: string, data: Omit<SaveFieldValueDto, 'status'>) =>
    request.patch<FieldValue>(`/field-config/values/${id}`, data),
  changeStatus: (id: string, status: FieldValue['status']) => request.patch<FieldValue>(`/field-config/values/${id}/status`, { status }),
  sort: (categoryId: string, items: Array<{ id: string; sortOrder: number }>) => request.put<FieldValue[]>(`/field-config/categories/${categoryId}/sort`, { items }),
  getReferenceStatus: (id: string) => request.get<FieldReferenceStatus>(`/field-config/values/${id}/reference-status`),
  remove: (id: string) => request.delete<void>(`/field-config/values/${id}`),
}

export const fieldOptionsApi = {
  getByModule: (moduleCode: string) =>
    request.get<FieldConfiguration[]>(`/field-options/module/${moduleCode}`),
  getByCode: (code: string) => request.get<EnabledFieldOptions>(`/field-options/${code}`),
  getBatch: (codes: string[]) => request.post<EnabledFieldOptions[]>('/field-options/batch', { codes }),
}
