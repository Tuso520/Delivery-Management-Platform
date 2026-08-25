export type PermissionActionGroup = 'VIEW' | 'OPERATE' | 'TRANSFER' | 'DELETE';

export interface PermissionPageMetadata {
  moduleCode: string;
  moduleName: string;
  moduleOrder: number;
  pageCode: string;
  pageName: string;
  pageOrder: number;
}

const PAGE_CATALOG: Record<string, Omit<PermissionPageMetadata, 'pageCode'>> = {
  auth: {
    moduleCode: 'workspace',
    moduleName: '工作台',
    moduleOrder: 10,
    pageName: '登录与个人信息',
    pageOrder: 10,
  },
  dashboard: {
    moduleCode: 'workspace',
    moduleName: '工作台',
    moduleOrder: 10,
    pageName: '工作台',
    pageOrder: 20,
  },
  project: {
    moduleCode: 'delivery',
    moduleName: '项目交付',
    moduleOrder: 20,
    pageName: '项目概览',
    pageOrder: 10,
  },
  payment: {
    moduleCode: 'delivery',
    moduleName: '项目交付',
    moduleOrder: 20,
    pageName: '款项计划',
    pageOrder: 20,
  },
  archive: {
    moduleCode: 'delivery',
    moduleName: '项目交付',
    moduleOrder: 20,
    pageName: '项目档案',
    pageOrder: 30,
  },
  file: {
    moduleCode: 'delivery',
    moduleName: '项目交付',
    moduleOrder: 20,
    pageName: '统一文件',
    pageOrder: 40,
  },
  file_review: {
    moduleCode: 'delivery',
    moduleName: '项目交付',
    moduleOrder: 20,
    pageName: '文件审核',
    pageOrder: 50,
  },
  archive_template: {
    moduleCode: 'standards',
    moduleName: '标准与知识',
    moduleOrder: 30,
    pageName: '档案模板',
    pageOrder: 10,
  },
  standard: {
    moduleCode: 'standards',
    moduleName: '标准与知识',
    moduleOrder: 30,
    pageName: '标准库',
    pageOrder: 20,
  },
  knowledge: {
    moduleCode: 'standards',
    moduleName: '标准与知识',
    moduleOrder: 30,
    pageName: '知识库',
    pageOrder: 30,
  },
  settings: {
    moduleCode: 'settings',
    moduleName: '系统设置',
    moduleOrder: 40,
    pageName: '系统设置入口',
    pageOrder: 10,
  },
  user: {
    moduleCode: 'settings',
    moduleName: '系统设置',
    moduleOrder: 40,
    pageName: '用户中心',
    pageOrder: 20,
  },
  role: {
    moduleCode: 'settings',
    moduleName: '系统设置',
    moduleOrder: 40,
    pageName: '角色权限',
    pageOrder: 30,
  },
  permission: {
    moduleCode: 'settings',
    moduleName: '系统设置',
    moduleOrder: 40,
    pageName: '角色权限',
    pageOrder: 30,
  },
  department: {
    moduleCode: 'settings',
    moduleName: '系统设置',
    moduleOrder: 40,
    pageName: '组织架构',
    pageOrder: 40,
  },
  currency: {
    moduleCode: 'settings',
    moduleName: '系统设置',
    moduleOrder: 40,
    pageName: '币种与汇率',
    pageOrder: 50,
  },
  field_setting: {
    moduleCode: 'settings',
    moduleName: '系统设置',
    moduleOrder: 40,
    pageName: '字段配置',
    pageOrder: 60,
  },
  dictionary: {
    moduleCode: 'settings',
    moduleName: '系统设置',
    moduleOrder: 40,
    pageName: '数据字典',
    pageOrder: 70,
  },
  notification_rule: {
    moduleCode: 'settings',
    moduleName: '系统设置',
    moduleOrder: 40,
    pageName: '通知规则',
    pageOrder: 80,
  },
  approval_config: {
    moduleCode: 'settings',
    moduleName: '系统设置',
    moduleOrder: 40,
    pageName: '审批配置',
    pageOrder: 90,
  },
  system_setting: {
    moduleCode: 'settings',
    moduleName: '系统设置',
    moduleOrder: 40,
    pageName: '系统配置',
    pageOrder: 100,
  },
  integration: {
    moduleCode: 'settings',
    moduleName: '系统设置',
    moduleOrder: 40,
    pageName: '接口集成',
    pageOrder: 110,
  },
};

export function permissionPageMetadata(resource: string): PermissionPageMetadata {
  const page = PAGE_CATALOG[resource] ?? {
    moduleCode: 'other',
    moduleName: '其他',
    moduleOrder: 999,
    pageName: resource,
    pageOrder: 999,
  };
  return { ...page, pageCode: resource };
}

export function permissionActionGroup(action: string): PermissionActionGroup {
  if (/delete|archive|disable/u.test(action)) return 'DELETE';
  if (/upload|download|import|export/u.test(action)) return 'TRANSFER';
  if (
    action === 'view' ||
    action === 'profile' ||
    action.includes('preview') ||
    action.startsWith('view_')
  )
    return 'VIEW';
  return 'OPERATE';
}

export function permissionSortOrder(resource: string, action: string): number {
  const page = permissionPageMetadata(resource);
  const actionRank: Record<PermissionActionGroup, number> = {
    VIEW: 10,
    OPERATE: 20,
    TRANSFER: 30,
    DELETE: 40,
  };
  return (
    page.moduleOrder * 10_000 + page.pageOrder * 100 + actionRank[permissionActionGroup(action)]
  );
}
