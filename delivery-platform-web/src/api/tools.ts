import request from './request'
import type {
  ToolCategory,
  ToolItem,
  CreateToolCategoryDto,
  UpdateToolCategoryDto,
  CreateToolItemDto,
  UpdateToolItemDto,
} from '@/types/tools'

export const toolApi = {
  // Categories
  getCategories() {
    return request.get<ToolCategory[]>('/tools/categories')
  },

  getCategoryById(id: string) {
    return request.get<ToolCategory>(`/tools/categories/${id}`)
  },

  createCategory(data: CreateToolCategoryDto) {
    return request.post<ToolCategory>('/tools/categories', data)
  },

  updateCategory(id: string, data: UpdateToolCategoryDto) {
    return request.put<ToolCategory>(`/tools/categories/${id}`, data)
  },

  deleteCategory(id: string) {
    return request.delete<void>(`/tools/categories/${id}`)
  },

  // Items
  getItems(categoryId?: string) {
    const params = categoryId ? { categoryId } : undefined
    return request.get<ToolItem[]>('/tools/items', { params })
  },

  getItemById(id: string) {
    return request.get<ToolItem>(`/tools/items/${id}`)
  },

  createItem(data: CreateToolItemDto) {
    return request.post<ToolItem>('/tools/items', data)
  },

  updateItem(id: string, data: UpdateToolItemDto) {
    return request.put<ToolItem>(`/tools/items/${id}`, data)
  },

  deleteItem(id: string) {
    return request.delete<void>(`/tools/items/${id}`)
  },
}
