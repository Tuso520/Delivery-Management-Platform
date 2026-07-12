import { PrismaClient } from '@prisma/client';
export interface PermissionSeed {
  permissionCode: string;
  permissionName: string;
  resource: string;
  action: string;
}
const permissionDefs: PermissionSeed[] = [
  // auth
  { permissionCode: 'auth:login', permissionName: '登录系统', resource: 'auth', action: 'login' },
  { permissionCode: 'auth:logout', permissionName: '退出系统', resource: 'auth', action: 'logout' },
  {
    permissionCode: 'auth:profile',
    permissionName: '查看个人信息',
    resource: 'auth',
    action: 'profile',
  },
  // user
  { permissionCode: 'user:view', permissionName: '查看用户列表', resource: 'user', action: 'view' },
  { permissionCode: 'user:create', permissionName: '创建用户', resource: 'user', action: 'create' },
  { permissionCode: 'user:update', permissionName: '编辑用户', resource: 'user', action: 'update' },
  { permissionCode: 'user:delete', permissionName: '删除用户', resource: 'user', action: 'delete' },
  {
    permissionCode: 'user:assign_role',
    permissionName: '分配角色',
    resource: 'user',
    action: 'assign_role',
  },
  {
    permissionCode: 'user:disable',
    permissionName: '禁用/启用用户',
    resource: 'user',
    action: 'disable',
  },
  {
    permissionCode: 'user:reset_password',
    permissionName: '重置密码',
    resource: 'user',
    action: 'reset_password',
  },
  // role
  { permissionCode: 'role:view', permissionName: '查看角色列表', resource: 'role', action: 'view' },
  { permissionCode: 'role:create', permissionName: '创建角色', resource: 'role', action: 'create' },
  { permissionCode: 'role:update', permissionName: '编辑角色', resource: 'role', action: 'update' },
  { permissionCode: 'role:delete', permissionName: '删除角色', resource: 'role', action: 'delete' },
  {
    permissionCode: 'role:assign_permission',
    permissionName: '分配权限',
    resource: 'role',
    action: 'assign_permission',
  },
  // permission
  {
    permissionCode: 'permission:view',
    permissionName: '查看权限列表',
    resource: 'permission',
    action: 'view',
  },
  // project
  {
    permissionCode: 'project:view',
    permissionName: '查看项目列表',
    resource: 'project',
    action: 'view',
  },
  {
    permissionCode: 'project:create',
    permissionName: '创建项目',
    resource: 'project',
    action: 'create',
  },
  {
    permissionCode: 'project:update',
    permissionName: '编辑项目',
    resource: 'project',
    action: 'update',
  },
  {
    permissionCode: 'project:delete',
    permissionName: '删除项目',
    resource: 'project',
    action: 'delete',
  },
  {
    permissionCode: 'project:manage_member',
    permissionName: '管理项目成员',
    resource: 'project',
    action: 'manage_member',
  },
  {
    permissionCode: 'project:archive',
    permissionName: '归档项目',
    resource: 'project',
    action: 'archive',
  },
  // archive
  {
    permissionCode: 'archive:view',
    permissionName: '查看档案目录',
    resource: 'archive',
    action: 'view',
  },
  {
    permissionCode: 'archive:upload',
    permissionName: '上传档案文件',
    resource: 'archive',
    action: 'upload',
  },
  // archive template
  {
    permissionCode: 'archive_template:view',
    permissionName: '查看档案模板',
    resource: 'archive_template',
    action: 'view',
  },
  {
    permissionCode: 'archive_template:create',
    permissionName: '创建档案模板',
    resource: 'archive_template',
    action: 'create',
  },
  {
    permissionCode: 'file:download',
    permissionName: '下载文件',
    resource: 'file',
    action: 'download',
  },
  {
    permissionCode: 'file:preview',
    permissionName: '预览文件',
    resource: 'file',
    action: 'preview',
  },
  // versioned knowledge
  {
    permissionCode: 'knowledge:view',
    permissionName: '查看知识库',
    resource: 'knowledge',
    action: 'view',
  },
  {
    permissionCode: 'knowledge:create',
    permissionName: '创建知识资料',
    resource: 'knowledge',
    action: 'create',
  },
  {
    permissionCode: 'knowledge:download',
    permissionName: '下载知识附件',
    resource: 'knowledge',
    action: 'download',
  },
  {
    permissionCode: 'knowledge:publish',
    permissionName: '发布知识资料',
    resource: 'knowledge',
    action: 'publish',
  },
  // tools
  {
    permissionCode: 'tools:view',
    permissionName: '查看工具中心',
    resource: 'tools',
    action: 'view',
  },
  {
    permissionCode: 'tools:manage',
    permissionName: '管理工具中心',
    resource: 'tools',
    action: 'manage',
  },
  // currency
  {
    permissionCode: 'currency:view',
    permissionName: '查看币种配置',
    resource: 'currency',
    action: 'view',
  },
  // dashboard
  {
    permissionCode: 'dashboard:view',
    permissionName: '查看仪表盘',
    resource: 'dashboard',
    action: 'view',
  },
  // project payments
  {
    permissionCode: 'payment:view',
    permissionName: '查看项目回款',
    resource: 'payment',
    action: 'view',
  },
  {
    permissionCode: 'payment:download',
    permissionName: '导出项目回款',
    resource: 'payment',
    action: 'download',
  },
  {
    permissionCode: 'payment:upload',
    permissionName: '导入项目回款',
    resource: 'payment',
    action: 'upload',
  },
  {
    permissionCode: 'payment:operate',
    permissionName: '操作项目回款',
    resource: 'payment',
    action: 'operate',
  },
  // organization
  {
    permissionCode: 'department:view',
    permissionName: '查看组织架构',
    resource: 'department',
    action: 'view',
  },
  {
    permissionCode: 'department:manage',
    permissionName: '管理组织架构',
    resource: 'department',
    action: 'manage',
  },
  // dictionaries
  {
    permissionCode: 'dictionary:view',
    permissionName: '查看数据字典',
    resource: 'dictionary',
    action: 'view',
  },
  {
    permissionCode: 'dictionary:manage',
    permissionName: '管理数据字典',
    resource: 'dictionary',
    action: 'manage',
  },
  // integration
  {
    permissionCode: 'integration:manage',
    permissionName: '管理集成配置',
    resource: 'integration',
    action: 'manage',
  },
  // target project and archive commands
  {
    permissionCode: 'project:stage:update',
    permissionName: '修改项目阶段',
    resource: 'project',
    action: 'stage_update',
  },
  {
    permissionCode: 'project:restore',
    permissionName: '恢复归档项目',
    resource: 'project',
    action: 'restore',
  },
  {
    permissionCode: 'project:view_contract',
    permissionName: '查看项目合同信息',
    resource: 'project',
    action: 'view_contract',
  },
  {
    permissionCode: 'project:view_financial',
    permissionName: '查看项目财务信息',
    resource: 'project',
    action: 'view_financial',
  },
  {
    permissionCode: 'project:view_acceptance',
    permissionName: '查看项目验收信息',
    resource: 'project',
    action: 'view_acceptance',
  },
  {
    permissionCode: 'archive:replace',
    permissionName: '替换正式档案文件',
    resource: 'archive',
    action: 'replace',
  },
  {
    permissionCode: 'archive:version:view',
    permissionName: '查看档案历史版本',
    resource: 'archive',
    action: 'version_view',
  },
  {
    permissionCode: 'archive:item:create_temporary',
    permissionName: '创建临时档案项',
    resource: 'archive',
    action: 'item_create_temporary',
  },
  {
    permissionCode: 'archive:item:archive',
    permissionName: '归档档案项',
    resource: 'archive',
    action: 'item_archive',
  },
  {
    permissionCode: 'archive:template:sync',
    permissionName: '同步档案模板差异',
    resource: 'archive',
    action: 'template_sync',
  },
  {
    permissionCode: 'file:preview_pending',
    permissionName: '预览审核中文件',
    resource: 'file',
    action: 'preview_pending',
  },
  {
    permissionCode: 'file:preview_history',
    permissionName: '预览历史文件版本',
    resource: 'file',
    action: 'preview_history',
  },
  {
    permissionCode: 'file:archive',
    permissionName: '归档文件',
    resource: 'file',
    action: 'archive',
  },
  {
    permissionCode: 'file_review:view',
    permissionName: '查看相关文件审核',
    resource: 'file_review',
    action: 'view',
  },
  {
    permissionCode: 'file_review:view_all',
    permissionName: '查看全部文件审核',
    resource: 'file_review',
    action: 'view_all',
  },
  {
    permissionCode: 'file_review:act',
    permissionName: '处理文件审核',
    resource: 'file_review',
    action: 'act',
  },
  {
    permissionCode: 'file_review:manage',
    permissionName: '管理文件审核',
    resource: 'file_review',
    action: 'manage',
  },
  {
    permissionCode: 'archive_template:update_draft',
    permissionName: '编辑档案模板草稿',
    resource: 'archive_template',
    action: 'update_draft',
  },
  {
    permissionCode: 'archive_template:submit_review',
    permissionName: '提交档案模板审核',
    resource: 'archive_template',
    action: 'submit_review',
  },
  {
    permissionCode: 'archive_template:publish',
    permissionName: '发布档案模板',
    resource: 'archive_template',
    action: 'publish',
  },
  {
    permissionCode: 'archive_template:disable',
    permissionName: '停用档案模板',
    resource: 'archive_template',
    action: 'disable',
  },
  // unified standard library
  {
    permissionCode: 'standard:view',
    permissionName: '查看标准库',
    resource: 'standard',
    action: 'view',
  },
  {
    permissionCode: 'standard:create',
    permissionName: '创建标准',
    resource: 'standard',
    action: 'create',
  },
  {
    permissionCode: 'standard:update_draft',
    permissionName: '编辑标准草稿',
    resource: 'standard',
    action: 'update_draft',
  },
  {
    permissionCode: 'standard:submit_review',
    permissionName: '提交标准审核',
    resource: 'standard',
    action: 'submit_review',
  },
  {
    permissionCode: 'standard:publish',
    permissionName: '发布标准',
    resource: 'standard',
    action: 'publish',
  },
  {
    permissionCode: 'standard:archive',
    permissionName: '归档标准',
    resource: 'standard',
    action: 'archive',
  },
  {
    permissionCode: 'standard:download',
    permissionName: '下载标准文件',
    resource: 'standard',
    action: 'download',
  },
  // versioned knowledge and settings
  {
    permissionCode: 'knowledge:update_draft',
    permissionName: '编辑知识草稿',
    resource: 'knowledge',
    action: 'update_draft',
  },
  {
    permissionCode: 'knowledge:submit_review',
    permissionName: '提交知识审核',
    resource: 'knowledge',
    action: 'submit_review',
  },
  {
    permissionCode: 'knowledge:archive',
    permissionName: '归档知识资料',
    resource: 'knowledge',
    action: 'archive',
  },
  {
    permissionCode: 'settings:view',
    permissionName: '查看设置入口',
    resource: 'settings',
    action: 'view',
  },
  {
    permissionCode: 'currency:manage',
    permissionName: '管理币种与汇率',
    resource: 'currency',
    action: 'manage',
  },
  {
    permissionCode: 'notification_rule:view',
    permissionName: '查看通知规则',
    resource: 'notification_rule',
    action: 'view',
  },
  {
    permissionCode: 'notification_rule:manage',
    permissionName: '管理通知规则',
    resource: 'notification_rule',
    action: 'manage',
  },
  {
    permissionCode: 'approval_config:view',
    permissionName: '查看审批配置',
    resource: 'approval_config',
    action: 'view',
  },
  {
    permissionCode: 'approval_config:manage',
    permissionName: '管理审批配置',
    resource: 'approval_config',
    action: 'manage',
  },
  {
    permissionCode: 'audit_log:view',
    permissionName: '查看操作日志',
    resource: 'audit_log',
    action: 'view',
  },
  {
    permissionCode: 'system_setting:view',
    permissionName: '查看系统配置',
    resource: 'system_setting',
    action: 'view',
  },
  {
    permissionCode: 'system_setting:manage',
    permissionName: '管理系统配置',
    resource: 'system_setting',
    action: 'manage',
  },
  {
    permissionCode: 'integration:view',
    permissionName: '查看接口集成',
    resource: 'integration',
    action: 'view',
  },
];
export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  for (const perm of permissionDefs) {
    await prisma.permission.upsert({
      where: { permissionCode: perm.permissionCode },
      update: {
        permissionName: perm.permissionName,
        resource: perm.resource,
        action: perm.action,
        deprecatedAt: null,
      },
      create: {
        permissionCode: perm.permissionCode,
        permissionName: perm.permissionName,
        resource: perm.resource,
        action: perm.action,
      },
    });
  }
  console.log(`Seeded ${permissionDefs.length} active permissions.`);
}
export function getAllPermissionCodes(): string[] {
  return permissionDefs.map((permission) => permission.permissionCode);
}
