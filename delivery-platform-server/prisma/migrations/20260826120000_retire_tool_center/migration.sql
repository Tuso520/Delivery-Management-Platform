-- Tool-center catalog data is intentionally retained for rollback and audit.
-- Removing runtime routes plus deprecating permissions stops all platform access.
UPDATE `permissions`
SET `deprecated_at` = CURRENT_TIMESTAMP(3)
WHERE `permission_code` IN ('tools:view', 'tools:manage')
  AND `deprecated_at` IS NULL;

-- Rollback: restore the retired application module first, then set deprecated_at
-- back to NULL for the two permission codes. No tool catalog rows are deleted.
