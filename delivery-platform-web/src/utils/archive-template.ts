interface ArchiveTreeOption {
  id: string
  name: string
  children?: ArchiveTreeOption[]
}

export interface ArchiveItemOption {
  id: string
  label: string
}

export function parseAllowedFileTypes(value?: string): string[] {
  if (!value) return []
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
}

export function flattenArchiveTemplateItems(
  items: ArchiveTreeOption[],
  depth = 0,
): ArchiveItemOption[] {
  return items.flatMap((item) => [
    {
      id: item.id,
      label: `${'　'.repeat(depth)}${item.name}`,
    },
    ...flattenArchiveTemplateItems(item.children ?? [], depth + 1),
  ])
}
