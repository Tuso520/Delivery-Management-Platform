import { DataScopeType, PrismaClient } from '@prisma/client';

import { getAllPermissionCodes } from './permissions';

interface RoleSeed {
  roleCode: string;
  roleName: string;
  description: string;
  defaultDataScope: DataScopeType;
  permissionCodes: string[];
}
const roleCatalog: RoleSeed[] = [
  {
    roleCode: 'SUPER_ADMIN',
    roleName: '超级管理员',
    description: '拥有系统全部权限，可进行所有操作',
    defaultDataScope: DataScopeType.ALL,
    permissionCodes: getAllPermissionCodes(),
  },
  {
    roleCode: 'SYSTEM_ADMIN',
    roleName: '系统管理员',
    description: '管理用户、角色、权限和系统配置，不涉及具体项目业务',
    defaultDataScope: DataScopeType.ALL,
    permissionCodes: [
      'user:view',
      'user:create',
      'user:update',
      'user:delete',
      'user:assign_role',
      'user:disable',
      'user:reset_password',
      'role:view',
      'role:create',
      'role:update',
      'role:delete',
      'role:assign_permission',
      'permission:view',
      'settings:view',
      'audit_log:view',
      'system_setting:view',
      'system_setting:manage',
      'notification_rule:view',
      'notification_rule:manage',
      'approval_config:view',
      'approval_config:manage',
      'integration:view',
      'integration:manage',
      'dashboard:view',
      'department:view',
      'department:manage',
      'dictionary:view',
      'dictionary:manage',
      'field_setting:manage',
    ],
  },
  {
    roleCode: 'DELIVERY_MANAGER',
    roleName: '交付负责人',
    description: '全局交付负责人，可查看所有项目相关数据及成本和档案',
    defaultDataScope: DataScopeType.ALL,
    permissionCodes: getAllPermissionCodes().filter((code) => {
      // All permissions except system admin specific ones
      const excludedPrefixes = [
        'user:',
        'role:',
        'permission:',
        'system_setting:manage',
        'field_setting:',
        'integration:',
      ];
      return !excludedPrefixes.some((prefix) => code.startsWith(prefix));
    }),
  },
  {
    roleCode: 'COUNTRY_MANAGER',
    roleName: '国家负责人',
    description: '负责特定国家的交付事务和项目档案',
    defaultDataScope: DataScopeType.COUNTRY,
    permissionCodes: [
      'project:view',
      'project:create',
      'project:update',
      'archive:view',
      'archive:upload',
      'file:download',
      'file:preview',
      'knowledge:view',
      'tools:view',
      'dashboard:view',
      'knowledge:download',
      'file_review:view',
      'file_review:act',
      'currency:view',
      'project:progress:update',
      'project:view_contract',
      'project:view_acceptance',
      'archive:version:view',
      'settings:view',
    ],
  },
  {
    roleCode: 'PROJECT_MANAGER',
    roleName: '项目经理',
    description: '负责具体项目的日常管理，包含档案管理和文件管理',
    defaultDataScope: DataScopeType.PARTICIPATED,
    permissionCodes: [
      'project:view',
      'project:update',
      'project:manage_member',
      'project:archive',
      'archive:view',
      'archive:upload',
      'file:download',
      'file:preview',
      'dashboard:view',
      'file_review:view',
      'file_review:act',
      'currency:view',
      'project:progress:update',
      'project:view_contract',
      'project:view_acceptance',
      'payment:view',
      'payment:operate',
      'project:restore',
      'archive:version:view',
      'archive:replace',
      'archive:item:archive',
      'settings:view',
    ],
  },
  {
    roleCode: 'ELEC_LEADER',
    roleName: '电气负责人',
    description: '电气专业负责人，管理电气相关的档案和文件',
    defaultDataScope: DataScopeType.PARTICIPATED,
    permissionCodes: [
      'project:view',
      'archive:view',
      'archive:upload',
      'file:download',
      'file:preview',
      'knowledge:view',
      'tools:view',
      'knowledge:download',
      'file_review:view',
      'currency:view',
      'archive:version:view',
      'archive:replace',
      'archive:item:archive',
      'settings:view',
    ],
  },
  {
    roleCode: 'ELEC_ENGINEER',
    roleName: '电气工程师',
    description: '电气专业工程师，上传电气相关档案和文件',
    defaultDataScope: DataScopeType.PARTICIPATED,
    permissionCodes: [
      'project:view',
      'archive:view',
      'archive:upload',
      'file:download',
      'file:preview',
      'knowledge:view',
      'tools:view',
      'knowledge:download',
      'file_review:view',
      'currency:view',
      'archive:version:view',
      'settings:view',
    ],
  },
  {
    roleCode: 'SOFTWARE_LEADER',
    roleName: '软件负责人',
    description: '软件专业负责人，管理软件相关的档案和文件',
    defaultDataScope: DataScopeType.PARTICIPATED,
    permissionCodes: [
      'project:view',
      'archive:view',
      'archive:upload',
      'file:download',
      'file:preview',
      'knowledge:view',
      'tools:view',
      'knowledge:download',
      'file_review:view',
      'currency:view',
      'archive:version:view',
      'archive:replace',
      'archive:item:archive',
      'settings:view',
    ],
  },
  {
    roleCode: 'SOFTWARE_ENGINEER',
    roleName: '软件工程师',
    description: '软件专业工程师，上传软件相关档案和文件',
    defaultDataScope: DataScopeType.PARTICIPATED,
    permissionCodes: [
      'project:view',
      'archive:view',
      'archive:upload',
      'file:download',
      'file:preview',
      'knowledge:view',
      'tools:view',
      'knowledge:download',
      'file_review:view',
      'currency:view',
      'archive:version:view',
      'settings:view',
    ],
  },
  {
    roleCode: 'PURCHASE',
    roleName: '采购人员',
    description: '负责采购相关业务，可查看项目成本',
    defaultDataScope: DataScopeType.PARTICIPATED,
    permissionCodes: [
      'project:view',
      'archive:view',
      'archive:upload',
      'file:download',
      'file:preview',
      'file_review:view',
      'currency:view',
      'payment:view',
      'payment:download',
      'project:view_contract',
      'project:view_financial',
      'project:view_acceptance',
      'archive:version:view',
      'settings:view',
    ],
  },
  {
    roleCode: 'FINANCE',
    roleName: '财务人员',
    description: '负责财务相关业务，可查看项目成本和币种信息',
    defaultDataScope: DataScopeType.PARTICIPATED,
    permissionCodes: [
      'project:view',
      'archive:view',
      'archive:upload',
      'file:download',
      'currency:view',
      'file:preview',
      'file_review:view',
      'payment:view',
      'payment:download',
      'project:view_contract',
      'project:view_financial',
      'project:view_acceptance',
      'archive:version:view',
      'settings:view',
    ],
  },
  {
    roleCode: 'HSE',
    roleName: '安全人员',
    description: '负责项目安全管理相关业务',
    defaultDataScope: DataScopeType.PARTICIPATED,
    permissionCodes: [
      'project:view',
      'archive:view',
      'archive:upload',
      'knowledge:view',
      'tools:view',
      'knowledge:download',
      'file:preview',
      'file_review:view',
      'currency:view',
      'archive:version:view',
      'settings:view',
    ],
  },
  {
    roleCode: 'STANDARD_ADMIN',
    roleName: '标准化管理员',
    description: '负责流程标准、模板库、知识库和工具中心的管理与维护',
    defaultDataScope: DataScopeType.OWNED,
    permissionCodes: [
      'standard:view',
      'standard:create',
      'standard:update_draft',
      'standard:submit_review',
      'standard:publish',
      'standard:archive',
      'standard:download',
      'knowledge:view',
      'knowledge:create',
      'knowledge:update_draft',
      'knowledge:submit_review',
      'knowledge:archive',
      'knowledge:publish',
      'tools:view',
      'tools:manage',
      'archive_template:view',
      'archive_template:create',
      'archive_template:update_draft',
      'archive_template:submit_review',
      'archive_template:publish',
      'archive_template:disable',
      'approval_config:view',
      'dashboard:view',
      'dictionary:view',
      'knowledge:download',
      'settings:view',
    ],
  },
  {
    roleCode: 'PARTNER',
    roleName: '外部合作方',
    description: '外部合作方，受限访问项目档案和文件',
    defaultDataScope: DataScopeType.PARTICIPATED,
    permissionCodes: [
      'project:view',
      'archive:view',
      'file:download',
      'file:preview',
      'file_review:view',
      'currency:view',
      'settings:view',
    ],
  },
  {
    roleCode: 'VIEWER',
    roleName: '只读用户',
    description: '只读权限，可查看项目、档案、文件和仪表盘',
    defaultDataScope: DataScopeType.PARTICIPATED,
    permissionCodes: [
      'project:view',
      'archive:view',
      'dashboard:view',
      'file:preview',
      'file_review:view',
      'currency:view',
      'settings:view',
    ],
  },
  {
    roleCode: 'AUDITOR',
    roleName: '审计人员',
    description: '负责项目审计，可查看项目数据、成本和操作日志',
    defaultDataScope: DataScopeType.PARTICIPATED,
    permissionCodes: [
      'project:view',
      'archive:view',
      'file:download',
      'settings:view',
      'audit_log:view',
      'dashboard:view',
      'file:preview',
      'file_review:view',
      'currency:view',
      'payment:view',
      'payment:download',
      'project:view_contract',
      'project:view_financial',
      'project:view_acceptance',
    ],
  },
];
export const roleDefs: RoleSeed[] = roleCatalog;
export async function seedRoles(prisma: PrismaClient): Promise<void> {
  for (const role of roleDefs) {
    const existingRole = await prisma.role.findUnique({
      where: { roleCode: role.roleCode },
      select: { id: true },
    });
    const createdRole = await prisma.role.upsert({
      where: { roleCode: role.roleCode },
      // Role names, descriptions and data scopes can be managed in production.
      // Seeding must never overwrite those choices on an existing role.
      update: {},
      create: {
        roleCode: role.roleCode,
        roleName: role.roleName,
        description: role.description,
        defaultDataScope: role.defaultDataScope,
      },
    });
    // A newly introduced role needs its initial matrix. Existing production
    // roles are user-managed, so a deploy-time seed must not silently grant
    // newly added permissions. Administrators can assign those explicitly.
    if (existingRole && process.env.NODE_ENV === 'production') {
      console.log(
        `Role "${role.roleCode}" already exists; preserving production metadata and permissions.`,
      );
      continue;
    }
    // Fetch matching permission IDs
    const permissions = await prisma.permission.findMany({
      where: {
        permissionCode: { in: role.permissionCodes },
        deprecatedAt: null,
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
    console.log(`Role "${role.roleCode}" seeded with ${permissions.length} permissions.`);
  }
}
