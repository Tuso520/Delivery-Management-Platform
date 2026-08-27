-- The SYSTEM_ADMIN role owns project deletion governance. Grant only the
-- minimum project visibility and logical-delete permissions required for it.
INSERT INTO `role_permissions` (`id`, `role_id`, `permission_id`)
SELECT UUID(), roles.id, permissions.id
FROM `roles`
INNER JOIN `permissions`
  ON permissions.permission_code IN ('project:view', 'project:delete')
  AND permissions.deprecated_at IS NULL
WHERE roles.role_code = 'SYSTEM_ADMIN'
  AND NOT EXISTS (
    SELECT 1
    FROM `role_permissions` existing
    WHERE existing.role_id = roles.id
      AND existing.permission_id = permissions.id
  );
