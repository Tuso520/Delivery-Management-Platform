import request from './request'

import type {
  CreateToolDefinitionDto,
  QueryToolsParams,
  ToolDefinition,
  UpdateToolDefinitionDto,
} from '@/types/tools'

export const toolApi = {
  getList(params?: QueryToolsParams) {
    return params
      ? request.get<ToolDefinition[]>('/tools', { params })
      : request.get<ToolDefinition[]>('/tools')
  },

  create(data: CreateToolDefinitionDto) {
    return request.post<ToolDefinition>('/tools', data)
  },

  update(id: string, data: UpdateToolDefinitionDto) {
    return request.patch<ToolDefinition>(`/tools/${id}`, data)
  },

  enable(id: string) {
    return request.post<ToolDefinition>(`/tools/${id}/enable`)
  },

  disable(id: string) {
    return request.post<ToolDefinition>(`/tools/${id}/disable`)
  },
}
