import type {
  ContractType,
  ProductType,
  ProjectDeliveryStage,
  ProjectKeyword,
  ProjectType,
} from '@/types/project'

export interface ProjectDictionaryOption<T extends string> {
  value: T
  label: string
  color: string
}

export const PROJECT_TYPE_OPTIONS: readonly ProjectDictionaryOption<ProjectType>[] = [
  { value: 'FACTORY', label: '工厂', color: 'arcoblue' },
  { value: 'DATA_CENTER', label: '数据中心', color: 'purple' },
  { value: 'COMMERCIAL', label: '商业', color: 'green' },
  { value: 'MEDICAL', label: '医疗', color: 'red' },
  { value: 'RAIL_TRANSIT', label: '轨道交通', color: 'orange' },
  { value: 'LIGHTWEIGHT', label: '轻量化', color: 'cyan' },
]

export const CONTRACT_TYPE_OPTIONS: readonly ProjectDictionaryOption<ContractType>[] = [
  { value: 'EPC', label: 'EPC', color: 'gold' },
  { value: 'EMC', label: 'EMC', color: 'lime' },
  { value: 'POC', label: 'POC', color: 'magenta' },
]

export const PRODUCT_TYPE_OPTIONS: readonly ProjectDictionaryOption<ProductType>[] = [
  { value: 'DEEPSIGHT', label: 'DeepSight', color: 'arcoblue' },
  { value: 'DEEPBOT', label: 'DeepBot', color: 'purple' },
]

export const PROJECT_KEYWORD_OPTIONS: readonly ProjectDictionaryOption<ProjectKeyword>[] = [
  ['NEW_BUILD', '新建项目', 'arcoblue'], ['RENOVATION', '改造项目', 'orange'],
  ['MAIN_MATERIAL', '主材', 'gold'], ['CONSTRUCTION', '施工', 'green'],
  ['SOFTWARE_COMMISSIONING', '软件调试', 'purple'], ['HARDWARE_COMMISSIONING', '硬件调试', 'cyan'],
  ['CHILLER_ENERGY_SAVING', '冷站节能', 'blue'], ['HVAC_ENERGY_SAVING', '空调节能', 'lime'],
  ['AIR_COMPRESSOR_ENERGY_SAVING', '空压节能', 'green'], ['EMCS_SYSTEM', 'EMCS系统', 'magenta'],
  ['ENERGY_MANAGEMENT_SYSTEM', '能管系统', 'arcoblue'], ['SOFTWARE_SYSTEM', '软件系统', 'purple'],
  ['CHILLER_PLANT_CONTROL', '冷站群控', 'cyan'], ['HIGH_EFFICIENCY_PLANT_ROOM', '高效机房', 'gold'],
  ['PLATFORM_CUSTOMIZATION', '平台定开', 'orange'], ['RESEARCH', '课题研究', 'red'],
].map(([value, label, color]) => ({ value, label, color })) as ProjectDictionaryOption<ProjectKeyword>[]

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

export function findProjectDictionaryOption<T extends string>(
  options: readonly ProjectDictionaryOption<T>[],
  value?: T | null,
): ProjectDictionaryOption<T> | undefined {
  return options.find((option) => option.value === value)
}
