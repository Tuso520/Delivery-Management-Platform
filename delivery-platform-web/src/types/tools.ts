export type ToolType = 'INTERNAL' | 'EXTERNAL'

export interface ToolDefinition {
  id: string
  name: string
  category: string
  description: string | null
  toolType: ToolType
  routeOrUrl: string | null
  enabled: boolean
  sortOrder: number
  configuration: Record<string, unknown> | null
}

export interface QueryToolsParams {
  category?: string
  includeDisabled?: boolean
}

export interface CreateToolDefinitionDto {
  name: string
  category: string
  description?: string
  toolType: ToolType
  routeOrUrl?: string
  sortOrder?: number
  configuration?: Record<string, unknown>
}

export interface UpdateToolDefinitionDto {
  name?: string
  category?: string
  description?: string
  toolType?: ToolType
  routeOrUrl?: string
  sortOrder?: number
  configuration?: Record<string, unknown>
}
