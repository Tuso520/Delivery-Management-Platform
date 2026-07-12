import request from './request'
import type {
  DepartmentNode,
  DictionaryCategory,
  RoleOption,
} from '@/types/platform'

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
