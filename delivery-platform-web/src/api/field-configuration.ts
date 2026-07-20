import request from './request'
import type { PaginatedData } from '@/types/api'
import type { EnabledFieldOptions, FieldCategory, FieldReferenceStatus, FieldValue, SaveFieldValueDto } from '@/types/field-configuration'

export const fieldConfigurationApi = {
  getCategories: () => request.get<FieldCategory[]>('/field-config/categories'),
  getValues: (
    categoryId: string,
    params: { page: number; pageSize: number; keyword?: string; status?: FieldValue['status'] },
  ) => request.get<PaginatedData<FieldValue>>(`/field-config/categories/${categoryId}/values`, { params }),
  create: (categoryId: string, data: SaveFieldValueDto) => request.post<FieldValue>(`/field-config/categories/${categoryId}/values`, data),
  update: (id: string, data: SaveFieldValueDto) => request.patch<FieldValue>(`/field-config/values/${id}`, data),
  changeStatus: (id: string, status: FieldValue['status']) => request.patch<FieldValue>(`/field-config/values/${id}/status`, { status }),
  sort: (categoryId: string, items: Array<{ id: string; sortOrder: number }>) => request.put<FieldValue[]>(`/field-config/categories/${categoryId}/sort`, { items }),
  getReferenceStatus: (id: string) => request.get<FieldReferenceStatus>(`/field-config/values/${id}/reference-status`),
  remove: (id: string) => request.delete<void>(`/field-config/values/${id}`),
}

export const fieldOptionsApi = {
  getByCode: (code: string) => request.get<EnabledFieldOptions>(`/field-options/${code}`),
  getBatch: (codes: string[]) => request.post<EnabledFieldOptions[]>('/field-options/batch', { codes }),
}
