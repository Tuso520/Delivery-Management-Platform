export interface ToolCategory {
  id: string
  name: string
  description: string | null
  sortOrder: number
  status: string
  createdAt: string
  updatedAt: string
  tools?: ToolItem[]
}

export interface ToolItem {
  id: string
  categoryId: string
  name: string
  description: string | null
  toolType: string
  url: string | null
  icon: string | null
  sortOrder: number
  status: string
  createdAt: string
  updatedAt: string
  category?: { id: string; name: string }
}

export interface CreateToolCategoryDto {
  name: string
  description?: string
  sortOrder?: number
}

export interface UpdateToolCategoryDto {
  name?: string
  description?: string
  sortOrder?: number
}

export interface CreateToolItemDto {
  categoryId: string
  name: string
  description?: string
  toolType?: string
  url?: string
  icon?: string
  sortOrder?: number
}

export interface UpdateToolItemDto {
  categoryId?: string
  name?: string
  description?: string
  toolType?: string
  url?: string
  icon?: string
  sortOrder?: number
}
