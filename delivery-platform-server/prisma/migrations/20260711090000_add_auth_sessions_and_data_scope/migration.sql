-- Phase 1 security foundation. This migration is additive and preserves all
-- existing users, role assignments and access tokens.

ALTER TABLE `users`
  ADD COLUMN `permission_version` INTEGER NOT NULL DEFAULT 1 AFTER `status`;

ALTER TABLE `roles`
  ADD COLUMN `default_data_scope` ENUM(
    'ALL',
    'DEPARTMENT',
    'COUNTRY',
    'OWNED',
    'PARTICIPATED',
    'CUSTOM'
  ) NOT NULL DEFAULT 'PARTICIPATED' AFTER `status`;

UPDATE `roles`
SET `default_data_scope` = CASE
  WHEN `role_code` IN ('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER') THEN 'ALL'
  WHEN `role_code` = 'COUNTRY_MANAGER' THEN 'COUNTRY'
  WHEN `role_code` = 'STANDARD_ADMIN' THEN 'OWNED'
  ELSE 'PARTICIPATED'
END;

ALTER TABLE `user_roles`
  ADD COLUMN `data_scope` ENUM(
    'ALL',
    'DEPARTMENT',
    'COUNTRY',
    'OWNED',
    'PARTICIPATED',
    'CUSTOM'
  ) NOT NULL DEFAULT 'PARTICIPATED',
  ADD COLUMN `scope_config` JSON NULL;

-- Preserve the current effective project visibility without hard-coding roles
-- in application services. Country managers remain country-scoped; until an
-- explicit country list is configured, the compatibility service derives the
-- allowed countries from their existing project memberships.
UPDATE `user_roles` ur
INNER JOIN `roles` r ON r.`id` = ur.`role_id`
SET ur.`data_scope` = r.`default_data_scope`;

CREATE INDEX `user_roles_user_id_data_scope_idx`
  ON `user_roles`(`user_id`, `data_scope`);

CREATE TABLE `refresh_sessions` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `family_id` VARCHAR(36) NOT NULL,
  `device_id` VARCHAR(100) NULL,
  `ip_address` VARCHAR(50) NULL,
  `user_agent` VARCHAR(500) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `last_used_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `revoke_reason` VARCHAR(50) NULL,
  `replaced_by_id` VARCHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `refresh_sessions_token_hash_key`(`token_hash`),
  UNIQUE INDEX `refresh_sessions_replaced_by_id_key`(`replaced_by_id`),
  INDEX `refresh_sessions_user_id_revoked_at_expires_at_idx`(`user_id`, `revoked_at`, `expires_at`),
  INDEX `refresh_sessions_family_id_idx`(`family_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `refresh_sessions`
  ADD CONSTRAINT `refresh_sessions_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `refresh_sessions`
  ADD CONSTRAINT `refresh_sessions_replaced_by_id_fkey`
  FOREIGN KEY (`replaced_by_id`) REFERENCES `refresh_sessions`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
