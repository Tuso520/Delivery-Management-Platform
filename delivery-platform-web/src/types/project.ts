export interface Project {
  id: string
  projectCode: string
  projectName: string
  countryCode: string
  city?: string
  customerName?: string
  projectType?: string
  contractCurrency?: string
  baseCurrency?: string
  contractAmount?: number
  exchangeRate?: number
  convertedAmount?: number
  exchangeRateDate?: string
  exchangeRateSource?: string
  projectLanguage?: string
  projectManagerId?: string
  electricLeaderId?: string
  softwareLeaderId?: string
  purchaseOwnerId?: string
  financeOwnerId?: string
  currentStage?: string
  projectStatus: string
  riskLevel: string
  startDate?: string
  plannedEndDate?: string
  actualEndDate?: string
  createdBy?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
  members?: ProjectMember[]
}

export interface ProjectMember {
  id: string
  projectId: string
  userId: string
  projectRole: string
  permissionLevel: string
  dataScope: string
  createdAt: string
  updatedAt: string
  user?: {
    id: string
    username: string
    realName: string
    email?: string
  }
}

export interface CreateProjectDto {
  projectName: string
  countryCode: string
  city?: string
  customerName?: string
  projectType?: string
  contractCurrency?: string
  baseCurrency?: string
  contractAmount?: number
  projectLanguage?: string
  projectManagerId?: string
  electricLeaderId?: string
  softwareLeaderId?: string
  purchaseOwnerId?: string
  financeOwnerId?: string
  currentStage?: string
  riskLevel?: string
  startDate?: string
  plannedEndDate?: string
}

export interface UpdateProjectDto {
  projectName?: string
  countryCode?: string
  city?: string
  customerName?: string
  projectType?: string
  contractCurrency?: string
  baseCurrency?: string
  contractAmount?: number
  projectLanguage?: string
  projectManagerId?: string
  electricLeaderId?: string
  softwareLeaderId?: string
  purchaseOwnerId?: string
  financeOwnerId?: string
  currentStage?: string
  projectStatus?: string
  riskLevel?: string
  startDate?: string
  plannedEndDate?: string
  actualEndDate?: string
}

export interface QueryProjectDto {
  page: number
  pageSize: number
  keyword?: string
  projectStatus?: string
  countryCode?: string
  projectType?: string
}

export const PROJECT_STATUS_OPTIONS = [
  { value: 'Draft', label: '草稿' },
  { value: 'Active', label: '进行中' },
  { value: 'Suspended', label: '暂停' },
  { value: 'Delayed', label: '延期' },
  { value: 'Accepted', label: '已验收' },
  { value: 'Archived', label: '已归档' },
  { value: 'Closed', label: '已关闭' },
]

export const RISK_LEVEL_OPTIONS = [
  { value: 'Low', label: '低' },
  { value: 'Medium', label: '中' },
  { value: 'High', label: '高' },
  { value: 'Critical', label: '严重' },
]

export const PROJECT_TYPE_OPTIONS = [
  { value: '冷站节能', label: '冷站节能' },
  { value: '空压节能', label: '空压节能' },
  { value: 'FMCS', label: 'FMCS' },
  { value: 'ESL', label: 'ESL' },
  { value: '电气工程', label: '电气工程' },
  { value: '软件工程', label: '软件工程' },
  { value: '集成项目', label: '集成项目' },
  { value: '运维服务', label: '运维服务' },
  { value: '其他', label: '其他' },
]

export const COUNTRY_OPTIONS = [
  { value: 'VN', label: '越南' },
  { value: 'TH', label: '泰国' },
  { value: 'MY', label: '马来西亚' },
  { value: 'ID', label: '印尼' },
  { value: 'SG', label: '新加坡' },
  { value: 'OM', label: '阿曼' },
  { value: 'CN', label: '中国' },
]

export const CURRENCY_OPTIONS = [
  { value: 'CNY', label: '人民币' },
  { value: 'USD', label: '美元' },
  { value: 'EUR', label: '欧元' },
  { value: 'VND', label: '越南盾' },
  { value: 'THB', label: '泰铢' },
  { value: 'MYR', label: '林吉特' },
  { value: 'IDR', label: '印尼盾' },
  { value: 'SGD', label: '新加坡元' },
  { value: 'OMR', label: '阿曼里亚尔' },
]

export const LANGUAGE_OPTIONS = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' },
  { value: 'vi-VN', label: 'Tieng Viet' },
  { value: 'th-TH', label: '泰语' },
  { value: 'ms-MY', label: '马来语' },
  { value: 'id-ID', label: '印尼语' },
]

export const STAGE_OPTIONS = [
  { value: 'Initiation', label: '项目启动' },
  { value: 'Design', label: '深化设计' },
  { value: 'Procurement', label: '采购与生产' },
  { value: 'Construction', label: '施工与安装' },
  { value: 'Commissioning', label: '调试阶段' },
  { value: 'Acceptance', label: '验收阶段' },
  { value: 'Closing', label: '收尾阶段' },
  { value: 'Review', label: '阶段评审' },
]

export const PROJECT_ROLE_OPTIONS = [
  { value: 'PROJECT_MANAGER', label: '项目经理' },
  { value: 'DELIVERY_MANAGER', label: '交付经理' },
  { value: 'COUNTRY_MANAGER', label: '国家负责人' },
  { value: 'ELEC_LEADER', label: '电气负责人' },
  { value: 'ELEC_ENGINEER', label: '电气工程师' },
  { value: 'SOFTWARE_LEADER', label: '软件负责人' },
  { value: 'SOFTWARE_ENGINEER', label: '软件工程师' },
  { value: 'PURCHASE', label: '采购人员' },
  { value: 'FINANCE', label: '财务人员' },
  { value: 'HSE', label: '安全人员' },
  { value: 'QUALITY_MANAGER', label: '质量管理员' },
  { value: 'MEMBER', label: '项目成员' },
]
