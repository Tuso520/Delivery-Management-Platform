import { PrismaClient } from '@prisma/client';
import { getAllPermissionCodes } from './permissions';

interface RoleSeed {
  roleCode: string;
  roleName: string;
  description: string;
  permissionCodes: string[];
}

export const roleDefs: RoleSeed[] = [
  {
    roleCode: 'SUPER_ADMIN',
    roleName: '超级管理员',
    description: '拥有系统全部权限，可进行所有操作',
    permissionCodes: getAllPermissionCodes(),
  },
  {
    roleCode: 'SYSTEM_ADMIN',
    roleName: '系统管理员',
    description: '管理用户、角色、权限和系统配置，不涉及具体项目业务',
    permissionCodes: [
      'user:view', 'user:create', 'user:update', 'user:delete',
      'user:assign_role', 'user:disable', 'user:reset_password',
      'role:view', 'role:create', 'role:update', 'role:delete', 'role:assign_permission',
      'permission:view',
      'system:view_log', 'system:manage_config', 'system:manage_backup',
      'notification:view', 'notification:create', 'notification:manage_rules',
      'integration:manage',
      'dashboard:view', 'todo:view',
      'department:view', 'department:manage',
      'dictionary:view', 'dictionary:manage',
      'approval:view', 'approval:manage',
      'training:view', 'training:manage',
      'skill:view', 'skill:manage',
      'attachment:view', 'attachment:upload', 'attachment:delete',
      'okr:view', 'okr:create', 'okr:update', 'okr:delete', 'okr:view_team', 'okr:score',
      'system:view_storage',
    ],
  },
  {
    roleCode: 'DELIVERY_MANAGER',
    roleName: '交付负责人',
    description: '全局交付负责人，可查看所有项目相关数据及成本、档案、检查项',
    permissionCodes: getAllPermissionCodes().filter((code) => {
      // All permissions except system admin specific ones
      const excludedPrefixes = ['user:', 'role:', 'permission:', 'system:manage_config', 'system:manage_backup', 'integration:'];
      return !excludedPrefixes.some((prefix) => code.startsWith(prefix));
    }),
  },
  {
    roleCode: 'COUNTRY_MANAGER',
    roleName: '国家负责人',
    description: '负责特定国家的交付事务，管理档案和检查项',
    permissionCodes: [
      'project:view', 'project:create', 'project:update',
      'archive:view', 'archive:upload', 'archive:review', 'archive:view_statistics',
      'file:view', 'file:upload', 'file:download', 'file:preview',
      'checklist:view', 'checklist:review', 'checklist:view_statistics',
      'attachment:view', 'attachment:upload',
      'knowledge:view', 'tools:view',
      'dashboard:view', 'todo:view',
      'report:view', 'report:create', 'report:update', 'report:submit', 'report:review',
      'retrospective:view', 'retrospective:manage',
      'approval:view', 'skill:view', 'training:view',
    ],
  },
  {
    roleCode: 'PROJECT_MANAGER',
    roleName: '项目经理',
    description: '负责具体项目的日常管理，包含档案管理、文件管理和检查项管理',
    permissionCodes: [
      'project:view', 'project:update', 'project:manage_member', 'project:archive',
      'archive:view', 'archive:upload', 'archive:delete', 'archive:review',
      'archive:mark_not_applicable', 'archive:view_statistics',
      'file:view', 'file:upload', 'file:download', 'file:preview',
      'file:delete', 'file:set_current', 'file:review',
      'checklist:view', 'checklist:create', 'checklist:update', 'checklist:delete',
      'checklist:submit', 'checklist:review', 'checklist:view_statistics',
      'dashboard:view', 'todo:view',
      'report:view', 'report:create', 'report:update', 'report:delete', 'report:submit', 'report:review',
      'retrospective:view', 'retrospective:manage',
      'attachment:view', 'attachment:upload', 'attachment:delete',
      'approval:view',
      'okr:view', 'okr:view_team', 'okr:score',
      'skill:view', 'training:view',
    ],
  },
  {
    roleCode: 'ELEC_LEADER',
    roleName: '电气负责人',
    description: '电气专业负责人，管理电气相关的档案和文件',
    permissionCodes: [
      'project:view',
      'archive:view', 'archive:upload', 'archive:delete',
      'file:view', 'file:upload', 'file:download', 'file:preview',
      'file:delete', 'file:set_current',
      'checklist:view', 'checklist:submit',
      'attachment:view', 'attachment:upload',
      'knowledge:view', 'tools:view',
    ],
  },
  {
    roleCode: 'ELEC_ENGINEER',
    roleName: '电气工程师',
    description: '电气专业工程师，上传电气相关档案和文件',
    permissionCodes: [
      'project:view',
      'archive:view', 'archive:upload',
      'file:view', 'file:upload', 'file:download', 'file:preview',
      'checklist:view', 'checklist:submit',
      'attachment:view', 'attachment:upload',
      'knowledge:view', 'tools:view',
    ],
  },
  {
    roleCode: 'SOFTWARE_LEADER',
    roleName: '软件负责人',
    description: '软件专业负责人，管理软件相关的档案和文件',
    permissionCodes: [
      'project:view',
      'archive:view', 'archive:upload', 'archive:delete',
      'file:view', 'file:upload', 'file:download', 'file:preview',
      'file:delete', 'file:set_current',
      'checklist:view', 'checklist:submit',
      'attachment:view', 'attachment:upload',
      'knowledge:view', 'tools:view',
    ],
  },
  {
    roleCode: 'SOFTWARE_ENGINEER',
    roleName: '软件工程师',
    description: '软件专业工程师，上传软件相关档案和文件',
    permissionCodes: [
      'project:view',
      'archive:view', 'archive:upload',
      'file:view', 'file:upload', 'file:download', 'file:preview',
      'checklist:view', 'checklist:submit',
      'attachment:view', 'attachment:upload',
      'knowledge:view', 'tools:view',
    ],
  },
  {
    roleCode: 'PURCHASE',
    roleName: '采购人员',
    description: '负责采购相关业务，可查看项目成本',
    permissionCodes: [
      'project:view', 'project:view_cost',
      'archive:view', 'archive:upload',
      'file:view', 'file:upload', 'file:download',
    ],
  },
  {
    roleCode: 'FINANCE',
    roleName: '财务人员',
    description: '负责财务相关业务，可查看项目成本和币种信息',
    permissionCodes: [
      'project:view', 'project:view_cost',
      'archive:view', 'archive:upload',
      'file:view', 'file:upload', 'file:download',
      'currency:view',
    ],
  },
  {
    roleCode: 'HSE',
    roleName: '安全人员',
    description: '负责项目安全管理相关业务',
    permissionCodes: [
      'project:view',
      'archive:view', 'archive:upload',
      'file:view', 'file:upload',
      'checklist:view', 'checklist:submit',
      'attachment:view', 'attachment:upload',
      'knowledge:view', 'tools:view',
    ],
  },
  {
    roleCode: 'STANDARD_ADMIN',
    roleName: '标准化管理员',
    description: '负责流程标准、模板库、知识库和工具中心的管理与维护',
    permissionCodes: [
      'workflow:view', 'workflow:create', 'workflow:update', 'workflow:delete',
      'template:view', 'template:create', 'template:update', 'template:delete', 'template:publish',
      'knowledge:view', 'knowledge:create', 'knowledge:update', 'knowledge:delete', 'knowledge:publish',
      'tools:view', 'tools:create', 'tools:update', 'tools:delete',
      'archive_template:view', 'archive_template:create', 'archive_template:update', 'archive_template:delete',
      'attachment:view', 'attachment:upload', 'attachment:delete',
      'approval:view',
      'dashboard:view', 'todo:view',
      'dictionary:view',
    ],
  },
  {
    roleCode: 'PARTNER',
    roleName: '外部合作方',
    description: '外部合作方，受限访问项目档案和文件',
    permissionCodes: [
      'project:view',
      'archive:view',
      'file:view', 'file:download',
    ],
  },
  {
    roleCode: 'VIEWER',
    roleName: '只读用户',
    description: '只读权限，可查看项目、档案、文件和仪表盘',
    permissionCodes: [
      'project:view',
      'archive:view',
      'file:view',
      'dashboard:view', 'todo:view',
    ],
  },
  {
    roleCode: 'AUDITOR',
    roleName: '审计人员',
    description: '负责项目审计，可查看项目数据、成本和操作日志',
    permissionCodes: [
      'project:view', 'project:view_cost',
      'archive:view',
      'file:view', 'file:download',
      'system:view_log',
      'dashboard:view',
    ],
  },
];

function expandPermissionCodes(permissionCodes: string[]): string[] {
  const expanded = new Set(permissionCodes);
  const addWhenPresent = (source: string, additions: string[]) => {
    if (expanded.has(source)) additions.forEach((code) => expanded.add(code));
  };

  addWhenPresent('attachment:view', ['attachment:download']);
  addWhenPresent('template:view', ['template:download']);
  addWhenPresent('workflow:view', ['workflow:download']);
  addWhenPresent('knowledge:view', ['knowledge:download']);
  addWhenPresent('training:view', ['training:download']);
  addWhenPresent('report:view', ['report:download']);
  addWhenPresent('okr:view', ['okr:download']);
  addWhenPresent('project:view', [
    'process_record:view',
    'process_record:download',
  ]);
  addWhenPresent('project:update', [
    'process_record:upload',
    'process_record:operate',
  ]);
  addWhenPresent('project:view_cost', ['payment:view', 'payment:download']);
  addWhenPresent('project:manage_member', ['payment:view', 'payment:operate']);
  addWhenPresent('attachment:upload', [
    'process_record:upload',
    'report:upload',
    'knowledge:upload',
    'training:upload',
  ]);
  addWhenPresent('template:update', ['template:upload', 'template:operate']);
  addWhenPresent('workflow:update', ['workflow:upload', 'workflow:operate']);
  addWhenPresent('knowledge:update', ['knowledge:operate']);
  addWhenPresent('okr:score', ['okr:operate']);

  return Array.from(expanded);
}

export async function seedRoles(prisma: PrismaClient): Promise<void> {
  for (const role of roleDefs) {
    const createdRole = await prisma.role.upsert({
      where: { roleCode: role.roleCode },
      update: {},
      create: {
        roleCode: role.roleCode,
        roleName: role.roleName,
        description: role.description,
      },
    });

    // Fetch matching permission IDs
    const permissions = await prisma.permission.findMany({
      where: {
        permissionCode: { in: expandPermissionCodes(role.permissionCodes) },
      },
      select: { id: true },
    });

    const existingRolePermissions = await prisma.rolePermission.findMany({
      where: { roleId: createdRole.id },
      select: { id: true, permissionId: true },
    });

    const existingPermissionIds = new Set(
      existingRolePermissions.map((rolePermission) => rolePermission.permissionId),
    );

    for (const permission of permissions) {
      if (existingPermissionIds.has(permission.id)) {
        continue;
      }

      await prisma.rolePermission.create({
        data: {
          roleId: createdRole.id,
          permissionId: permission.id,
        },
      });
    }

    console.log(
      `Role "${role.roleCode}" seeded with ${permissions.length} permissions.`,
    );
  }
}
