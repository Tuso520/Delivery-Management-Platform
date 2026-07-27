export type ProjectDictionaryKind =
  | 'customerType'
  | 'projectType'
  | 'contractType'
  | 'productType'
  | 'projectKeyword'
  | 'projectStage'

const COLORS: Readonly<Record<ProjectDictionaryKind, readonly string[]>> = {
  customerType: ['arcoblue', 'purple', 'green', 'red', 'orange', 'cyan'],
  projectType: ['arcoblue', 'purple', 'green', 'red', 'orange', 'cyan'],
  contractType: ['gold', 'lime', 'magenta'],
  productType: ['arcoblue', 'purple'],
  projectKeyword: ['arcoblue', 'orange', 'gold', 'green', 'purple', 'cyan', 'blue', 'lime'],
  projectStage: ['arcoblue', 'green', 'orange', 'blue', 'lime', 'purple', 'cyan', 'gold'],
}

export function projectDictionaryColor(kind: ProjectDictionaryKind, value: string): string {
  const palette = COLORS[kind]
  let hash = 0
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return palette[hash % palette.length]
}
