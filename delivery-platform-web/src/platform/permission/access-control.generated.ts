// 此文件由 scripts/sync-access-control-contract.mjs 根据后端 seed 事实源生成。
// 禁止手工编辑；修改权限目录或角色矩阵后执行 node scripts/sync-access-control-contract.mjs --write。

export const PERMISSION_CODES = [
  "auth:login",
  "auth:logout",
  "auth:profile",
  "user:view",
  "user:create",
  "user:update",
  "user:delete",
  "user:assign_role",
  "user:disable",
  "user:reset_password",
  "role:view",
  "role:create",
  "role:update",
  "role:delete",
  "role:assign_permission",
  "permission:view",
  "project:view",
  "project:create",
  "project:update",
  "project:delete",
  "project:manage_member",
  "project:archive",
  "archive:view",
  "archive:upload",
  "archive_template:view",
  "archive_template:create",
  "file:download",
  "file:preview",
  "knowledge:view",
  "knowledge:create",
  "knowledge:download",
  "knowledge:publish",
  "tools:view",
  "tools:manage",
  "currency:view",
  "dashboard:view",
  "payment:view",
  "payment:download",
  "payment:upload",
  "payment:operate",
  "department:view",
  "department:manage",
  "dictionary:view",
  "dictionary:manage",
  "integration:manage",
  "project:progress:update",
  "project:restore",
  "project:view_contract",
  "project:view_financial",
  "project:view_acceptance",
  "archive:replace",
  "archive:version:view",
  "archive:item:create_temporary",
  "archive:item:archive",
  "archive:template:sync",
  "file:preview_pending",
  "file:preview_history",
  "file:archive",
  "file_review:view",
  "file_review:view_all",
  "file_review:act",
  "file_review:manage",
  "archive_template:update_draft",
  "archive_template:submit_review",
  "archive_template:publish",
  "archive_template:disable",
  "standard:view",
  "standard:create",
  "standard:update_draft",
  "standard:submit_review",
  "standard:publish",
  "standard:archive",
  "standard:download",
  "knowledge:update_draft",
  "knowledge:submit_review",
  "knowledge:archive",
  "settings:view",
  "field_setting:manage",
  "currency:manage",
  "notification_rule:view",
  "notification_rule:manage",
  "approval_config:view",
  "approval_config:manage",
  "system_setting:view",
  "system_setting:manage",
  "integration:view"
] as const

export type PermissionCode = (typeof PERMISSION_CODES)[number]

export const ROLE_CODES = [
  "SUPER_ADMIN",
  "SYSTEM_ADMIN",
  "DELIVERY_MANAGER",
  "COUNTRY_MANAGER",
  "PROJECT_MANAGER",
  "ELEC_LEADER",
  "ELEC_ENGINEER",
  "SOFTWARE_LEADER",
  "SOFTWARE_ENGINEER",
  "PURCHASE",
  "FINANCE",
  "HSE",
  "STANDARD_ADMIN",
  "PARTNER",
  "VIEWER",
  "AUDITOR"
] as const

export type RoleCode = (typeof ROLE_CODES)[number]

const permissionCodeSet: ReadonlySet<string> = new Set(PERMISSION_CODES)
const roleCodeSet: ReadonlySet<string> = new Set(ROLE_CODES)

export function isPermissionCode(value: string): value is PermissionCode {
  return permissionCodeSet.has(value)
}

export function isRoleCode(value: string): value is RoleCode {
  return roleCodeSet.has(value)
}
