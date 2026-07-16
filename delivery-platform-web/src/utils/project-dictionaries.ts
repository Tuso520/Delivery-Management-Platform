import type { ProjectDeliveryStage } from '@/types/project'

export type ProjectDictionaryKind = 'projectType' | 'contractType' | 'productType' | 'projectKeyword'

const COLORS: Readonly<Record<ProjectDictionaryKind, readonly string[]>> = {
  projectType: ['arcoblue', 'purple', 'green', 'red', 'orange', 'cyan'],
  contractType: ['gold', 'lime', 'magenta'],
  productType: ['arcoblue', 'purple'],
  projectKeyword: ['arcoblue', 'orange', 'gold', 'green', 'purple', 'cyan', 'blue', 'lime'],
}

export function projectDictionaryColor(kind: ProjectDictionaryKind, value: string): string {
  const palette = COLORS[kind]
  let hash = 0
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return palette[hash % palette.length]
}

export const PROJECT_STAGE_COLORS: Readonly<Record<ProjectDeliveryStage, string>> = {
  STARTUP: 'arcoblue',
  DEEPENING: 'purple',
  PROCUREMENT: 'orange',
  CONSTRUCTION: 'gold',
  COMMISSIONING: 'cyan',
  TESTING: 'blue',
  INTERNAL_ACCEPTANCE: 'lime',
  EXTERNAL_ACCEPTANCE: 'green',
  WARRANTY: 'gray',
}
