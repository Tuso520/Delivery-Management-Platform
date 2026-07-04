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
  { permissionCode: 'auth:profile', permissionName: '查看个人信息', resource: 'auth', action: 'profile' },

  // user
  { permissionCode: 'user:view', permissionName: '查看用户列表', resource: 'user', action: 'view' },
  { permissionCode: 'user:create', permissionName: '创建用户', resource: 'user', action: 'create' },
  { permissionCode: 'user:update', permissionName: '编辑用户', resource: 'user', action: 'update' },
  { permissionCode: 'user:delete', permissionName: '删除用户', resource: 'user', action: 'delete' },
  { permissionCode: 'user:assign_role', permissionName: '分配角色', resource: 'user', action: 'assign_role' },
  { permissionCode: 'user:disable', permissionName: '禁用/启用用户', resource: 'user', action: 'disable' },
  { permissionCode: 'user:reset_password', permissionName: '重置密码', resource: 'user', action: 'reset_password' },

  // role
  { permissionCode: 'role:view', permissionName: '查看角色列表', resource: 'role', action: 'view' },
  { permissionCode: 'role:create', permissionName: '创建角色', resource: 'role', action: 'create' },
  { permissionCode: 'role:update', permissionName: '编辑角色', resource: 'role', action: 'update' },
  { permissionCode: 'role:delete', permissionName: '删除角色', resource: 'role', action: 'delete' },
  { permissionCode: 'role:assign_permission', permissionName: '分配权限', resource: 'role', action: 'assign_permission' },

  // permission
  { permissionCode: 'permission:view', permissionName: '查看权限列表', resource: 'permission', action: 'view' },

  // project
  { permissionCode: 'project:view', permissionName: '查看项目列表', resource: 'project', action: 'view' },
  { permissionCode: 'project:create', permissionName: '创建项目', resource: 'project', action: 'create' },
  { permissionCode: 'project:update', permissionName: '编辑项目', resource: 'project', action: 'update' },
  { permissionCode: 'project:delete', permissionName: '删除项目', resource: 'project', action: 'delete' },
  { permissionCode: 'project:view_cost', permissionName: '查看项目成本', resource: 'project', action: 'view_cost' },
  { permissionCode: 'project:manage_member', permissionName: '管理项目成员', resource: 'project', action: 'manage_member' },
  { permissionCode: 'project:archive', permissionName: '归档项目', resource: 'project', action: 'archive' },

  // archive
  { permissionCode: 'archive:view', permissionName: '查看档案目录', resource: 'archive', action: 'view' },
  { permissionCode: 'archive:upload', permissionName: '上传档案文件', resource: 'archive', action: 'upload' },
  { permissionCode: 'archive:delete', permissionName: '删除档案文件', resource: 'archive', action: 'delete' },
  { permissionCode: 'archive:review', permissionName: '审核档案文件', resource: 'archive', action: 'review' },
  { permissionCode: 'archive:mark_not_applicable', permissionName: '标记不适用', resource: 'archive', action: 'mark_not_applicable' },
  { permissionCode: 'archive:view_statistics', permissionName: '查看档案统计', resource: 'archive', action: 'view_statistics' },
  { permissionCode: 'archive:generate', permissionName: '生成项目档案', resource: 'archive', action: 'generate' },
  { permissionCode: 'archive:update', permissionName: '更新档案目录项', resource: 'archive', action: 'update' },

  // archive template
  { permissionCode: 'archive_template:view', permissionName: '查看档案模板', resource: 'archive_template', action: 'view' },
  { permissionCode: 'archive_template:create', permissionName: '创建档案模板', resource: 'archive_template', action: 'create' },
  { permissionCode: 'archive_template:update', permissionName: '编辑档案模板', resource: 'archive_template', action: 'update' },
  { permissionCode: 'archive_template:delete', permissionName: '删除档案模板', resource: 'archive_template', action: 'delete' },

  // file
  { permissionCode: 'file:view', permissionName: '查看文件列表', resource: 'file', action: 'view' },
  { permissionCode: 'file:upload', permissionName: '上传文件', resource: 'file', action: 'upload' },
  { permissionCode: 'file:download', permissionName: '下载文件', resource: 'file', action: 'download' },
  { permissionCode: 'file:preview', permissionName: '预览文件', resource: 'file', action: 'preview' },
  { permissionCode: 'file:delete', permissionName: '删除文件', resource: 'file', action: 'delete' },
  { permissionCode: 'file:set_current', permissionName: '设为当前版本', resource: 'file', action: 'set_current' },
  { permissionCode: 'file:review', permissionName: '审核文件', resource: 'file', action: 'review' },
  { permissionCode: 'attachment:view', permissionName: '查看通用附件', resource: 'attachment', action: 'view' },
  { permissionCode: 'attachment:upload', permissionName: '上传通用附件', resource: 'attachment', action: 'upload' },
  { permissionCode: 'attachment:download', permissionName: '下载通用附件', resource: 'attachment', action: 'download' },
  { permissionCode: 'attachment:delete', permissionName: '删除通用附件', resource: 'attachment', action: 'delete' },

  // checklist
  { permissionCode: 'checklist:view', permissionName: '查看检查项', resource: 'checklist', action: 'view' },
  { permissionCode: 'checklist:create', permissionName: '创建检查项', resource: 'checklist', action: 'create' },
  { permissionCode: 'checklist:update', permissionName: '编辑检查项', resource: 'checklist', action: 'update' },
  { permissionCode: 'checklist:delete', permissionName: '删除检查项', resource: 'checklist', action: 'delete' },
  { permissionCode: 'checklist:submit', permissionName: '提交检查项', resource: 'checklist', action: 'submit' },
  { permissionCode: 'checklist:review', permissionName: '审核检查项', resource: 'checklist', action: 'review' },
  { permissionCode: 'checklist:view_statistics', permissionName: '查看检查项统计', resource: 'checklist', action: 'view_statistics' },

  // workflow
  { permissionCode: 'workflow:view', permissionName: '查看流程文档', resource: 'workflow', action: 'view' },
  { permissionCode: 'workflow:create', permissionName: '创建流程文档', resource: 'workflow', action: 'create' },
  { permissionCode: 'workflow:upload', permissionName: '上传流程附件', resource: 'workflow', action: 'upload' },
  { permissionCode: 'workflow:download', permissionName: '下载流程文档', resource: 'workflow', action: 'download' },
  { permissionCode: 'workflow:operate', permissionName: '操作流程文档', resource: 'workflow', action: 'operate' },
  { permissionCode: 'workflow:update', permissionName: '编辑流程文档', resource: 'workflow', action: 'update' },
  { permissionCode: 'workflow:delete', permissionName: '删除流程文档', resource: 'workflow', action: 'delete' },

  // template
  { permissionCode: 'template:view', permissionName: '查看模板库', resource: 'template', action: 'view' },
  { permissionCode: 'template:create', permissionName: '创建模板', resource: 'template', action: 'create' },
  { permissionCode: 'template:upload', permissionName: '上传模板文件', resource: 'template', action: 'upload' },
  { permissionCode: 'template:download', permissionName: '下载模板文件', resource: 'template', action: 'download' },
  { permissionCode: 'template:operate', permissionName: '操作模板', resource: 'template', action: 'operate' },
  { permissionCode: 'template:update', permissionName: '编辑模板', resource: 'template', action: 'update' },
  { permissionCode: 'template:delete', permissionName: '删除模板', resource: 'template', action: 'delete' },
  { permissionCode: 'template:publish', permissionName: '发布模板', resource: 'template', action: 'publish' },

  // knowledge
  { permissionCode: 'knowledge:view', permissionName: '查看知识库', resource: 'knowledge', action: 'view' },
  { permissionCode: 'knowledge:create', permissionName: '创建知识文章', resource: 'knowledge', action: 'create' },
  { permissionCode: 'knowledge:upload', permissionName: '上传知识附件', resource: 'knowledge', action: 'upload' },
  { permissionCode: 'knowledge:download', permissionName: '下载知识附件', resource: 'knowledge', action: 'download' },
  { permissionCode: 'knowledge:operate', permissionName: '操作知识内容', resource: 'knowledge', action: 'operate' },
  { permissionCode: 'knowledge:update', permissionName: '编辑知识文章', resource: 'knowledge', action: 'update' },
  { permissionCode: 'knowledge:delete', permissionName: '删除知识文章', resource: 'knowledge', action: 'delete' },
  { permissionCode: 'knowledge:publish', permissionName: '发布知识文章', resource: 'knowledge', action: 'publish' },

  // tools
  { permissionCode: 'tools:view', permissionName: '查看工具中心', resource: 'tools', action: 'view' },
  { permissionCode: 'tools:create', permissionName: '创建工具', resource: 'tools', action: 'create' },
  { permissionCode: 'tools:update', permissionName: '编辑工具', resource: 'tools', action: 'update' },
  { permissionCode: 'tools:delete', permissionName: '删除工具', resource: 'tools', action: 'delete' },

  // country
  { permissionCode: 'country:view', permissionName: '查看国家配置', resource: 'country', action: 'view' },
  { permissionCode: 'country:create', permissionName: '创建国家', resource: 'country', action: 'create' },
  { permissionCode: 'country:update', permissionName: '编辑国家', resource: 'country', action: 'update' },
  { permissionCode: 'country:delete', permissionName: '删除国家', resource: 'country', action: 'delete' },

  // currency
  { permissionCode: 'currency:view', permissionName: '查看币种配置', resource: 'currency', action: 'view' },
  { permissionCode: 'currency:create', permissionName: '创建币种', resource: 'currency', action: 'create' },
  { permissionCode: 'currency:update', permissionName: '编辑币种', resource: 'currency', action: 'update' },
  { permissionCode: 'currency:delete', permissionName: '删除币种', resource: 'currency', action: 'delete' },

  // language
  { permissionCode: 'language:view', permissionName: '查看语言配置', resource: 'language', action: 'view' },
  { permissionCode: 'language:create', permissionName: '创建语言', resource: 'language', action: 'create' },
  { permissionCode: 'language:update', permissionName: '编辑语言', resource: 'language', action: 'update' },
  { permissionCode: 'language:delete', permissionName: '删除语言', resource: 'language', action: 'delete' },

  // dashboard
  { permissionCode: 'dashboard:view', permissionName: '查看仪表盘', resource: 'dashboard', action: 'view' },
  { permissionCode: 'todo:view', permissionName: '查看我的待办', resource: 'todo', action: 'view' },

  // reports
  { permissionCode: 'report:view', permissionName: '查看工作报告', resource: 'report', action: 'view' },
  { permissionCode: 'report:create', permissionName: '创建工作报告', resource: 'report', action: 'create' },
  { permissionCode: 'report:update', permissionName: '编辑工作报告', resource: 'report', action: 'update' },
  { permissionCode: 'report:delete', permissionName: '删除工作报告', resource: 'report', action: 'delete' },
  { permissionCode: 'report:submit', permissionName: '提交工作报告', resource: 'report', action: 'submit' },
  { permissionCode: 'report:review', permissionName: '审核工作报告', resource: 'report', action: 'review' },
  { permissionCode: 'report:download', permissionName: '导出工作报告', resource: 'report', action: 'download' },
  { permissionCode: 'report:upload', permissionName: '上传报告附件', resource: 'report', action: 'upload' },
  { permissionCode: 'report:operate', permissionName: '操作工作报告', resource: 'report', action: 'operate' },

  // project process records and payments
  { permissionCode: 'process_record:view', permissionName: '查看项目过程记录', resource: 'process_record', action: 'view' },
  { permissionCode: 'process_record:download', permissionName: '下载过程记录附件', resource: 'process_record', action: 'download' },
  { permissionCode: 'process_record:upload', permissionName: '上传项目过程记录', resource: 'process_record', action: 'upload' },
  { permissionCode: 'process_record:operate', permissionName: '操作项目过程记录', resource: 'process_record', action: 'operate' },
  { permissionCode: 'payment:view', permissionName: '查看项目回款', resource: 'payment', action: 'view' },
  { permissionCode: 'payment:download', permissionName: '导出项目回款', resource: 'payment', action: 'download' },
  { permissionCode: 'payment:upload', permissionName: '导入项目回款', resource: 'payment', action: 'upload' },
  { permissionCode: 'payment:operate', permissionName: '操作项目回款', resource: 'payment', action: 'operate' },

  // okr and performance
  { permissionCode: 'okr:view', permissionName: '查看OKR', resource: 'okr', action: 'view' },
  { permissionCode: 'okr:create', permissionName: '创建OKR', resource: 'okr', action: 'create' },
  { permissionCode: 'okr:update', permissionName: '编辑OKR', resource: 'okr', action: 'update' },
  { permissionCode: 'okr:delete', permissionName: '删除OKR', resource: 'okr', action: 'delete' },
  { permissionCode: 'okr:view_team', permissionName: '查看团队OKR', resource: 'okr', action: 'view_team' },
  { permissionCode: 'okr:score', permissionName: '绩效评分', resource: 'okr', action: 'score' },
  { permissionCode: 'okr:download', permissionName: '导出目标绩效', resource: 'okr', action: 'download' },
  { permissionCode: 'okr:upload', permissionName: '导入目标绩效', resource: 'okr', action: 'upload' },
  { permissionCode: 'okr:operate', permissionName: '配置评分流程', resource: 'okr', action: 'operate' },
  { permissionCode: 'skill:view', permissionName: '查看技能评估', resource: 'skill', action: 'view' },
  { permissionCode: 'skill:manage', permissionName: '管理技能评估', resource: 'skill', action: 'manage' },
  { permissionCode: 'training:view', permissionName: '查看培训记录', resource: 'training', action: 'view' },
  { permissionCode: 'training:download', permissionName: '下载培训资料', resource: 'training', action: 'download' },
  { permissionCode: 'training:upload', permissionName: '上传培训资料和录屏', resource: 'training', action: 'upload' },
  { permissionCode: 'training:manage', permissionName: '管理培训记录', resource: 'training', action: 'manage' },

  // organization
  { permissionCode: 'department:view', permissionName: '查看组织架构', resource: 'department', action: 'view' },
  { permissionCode: 'department:manage', permissionName: '管理组织架构', resource: 'department', action: 'manage' },

  // project retrospective
  { permissionCode: 'retrospective:view', permissionName: '查看项目复盘', resource: 'retrospective', action: 'view' },
  { permissionCode: 'retrospective:manage', permissionName: '管理项目复盘', resource: 'retrospective', action: 'manage' },

  // dictionaries and approvals
  { permissionCode: 'dictionary:view', permissionName: '查看数据字典', resource: 'dictionary', action: 'view' },
  { permissionCode: 'dictionary:manage', permissionName: '管理数据字典', resource: 'dictionary', action: 'manage' },
  { permissionCode: 'approval:view', permissionName: '查看审批任务', resource: 'approval', action: 'view' },
  { permissionCode: 'approval:manage', permissionName: '管理审批模板', resource: 'approval', action: 'manage' },

  // system
  { permissionCode: 'system:view_log', permissionName: '查看操作日志', resource: 'system', action: 'view_log' },
  { permissionCode: 'system:manage_config', permissionName: '管理系统配置', resource: 'system', action: 'manage_config' },
  { permissionCode: 'system:manage_backup', permissionName: '管理备份', resource: 'system', action: 'manage_backup' },
  { permissionCode: 'system:view_storage', permissionName: '查看存储状态', resource: 'system', action: 'view_storage' },

  // notification
  { permissionCode: 'notification:view', permissionName: '查看系统通知', resource: 'notification', action: 'view' },
  { permissionCode: 'notification:create', permissionName: '发送系统通知', resource: 'notification', action: 'create' },
  { permissionCode: 'notification:manage_rules', permissionName: '管理通知规则', resource: 'notification', action: 'manage_rules' },

  // integration
  { permissionCode: 'integration:manage', permissionName: '管理集成配置', resource: 'integration', action: 'manage' },
];

export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  for (const perm of permissionDefs) {
    await prisma.permission.upsert({
      where: { permissionCode: perm.permissionCode },
      update: {},
      create: {
        permissionCode: perm.permissionCode,
        permissionName: perm.permissionName,
        resource: perm.resource,
        action: perm.action,
      },
    });
  }

  console.log(`Seeded ${permissionDefs.length} permissions.`);
}

export function getAllPermissionCodes(): string[] {
  return permissionDefs.map((p) => p.permissionCode);
}
