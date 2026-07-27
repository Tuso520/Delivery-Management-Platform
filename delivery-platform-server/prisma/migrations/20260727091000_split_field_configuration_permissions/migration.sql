INSERT INTO `permissions` (
  `id`,
  `permission_code`,
  `permission_name`,
  `resource`,
  `action`,
  `created_at`,
  `updated_at`
)
VALUES
  (UUID(), 'field_setting:view', '查看字段配置', 'field_setting', 'view', NOW(), NOW()),
  (UUID(), 'field_setting:edit', '编辑字段配置', 'field_setting', 'edit', NOW(), NOW()),
  (UUID(), 'field_setting:option_create', '新增字段枚举', 'field_setting', 'option_create', NOW(), NOW()),
  (UUID(), 'field_setting:option_toggle', '启停字段枚举', 'field_setting', 'option_toggle', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `permission_name` = VALUES(`permission_name`),
  `resource` = VALUES(`resource`),
  `action` = VALUES(`action`),
  `deprecated_at` = NULL,
  `updated_at` = NOW();

INSERT IGNORE INTO `role_permissions` (`id`, `role_id`, `permission_id`)
SELECT UUID(), legacy_assignment.`role_id`, new_permission.`id`
FROM (
  SELECT role_permission.`role_id`
  FROM `role_permissions` role_permission
  INNER JOIN `permissions` legacy_permission
    ON legacy_permission.`id` = role_permission.`permission_id`
  WHERE legacy_permission.`permission_code` = 'field_setting:manage'
) legacy_assignment
CROSS JOIN `permissions` new_permission
WHERE new_permission.`permission_code` IN (
  'field_setting:view',
  'field_setting:edit',
  'field_setting:option_create',
  'field_setting:option_toggle'
);

DELETE role_permission
FROM `role_permissions` role_permission
INNER JOIN `permissions` legacy_permission
  ON legacy_permission.`id` = role_permission.`permission_id`
WHERE legacy_permission.`permission_code` = 'field_setting:manage';

DELETE FROM `permissions`
WHERE `permission_code` = 'field_setting:manage';
