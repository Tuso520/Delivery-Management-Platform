-- 飞书身份、组织成员关系与分层权限契约。
ALTER TABLE `users`
  ADD COLUMN `avatar_url` VARCHAR(500) NULL AFTER `phone`;

ALTER TABLE `external_identities`
  ADD COLUMN `open_id` VARCHAR(100) NULL AFTER `identifier_type`,
  ADD COLUMN `union_id` VARCHAR(100) NULL AFTER `open_id`,
  ADD COLUMN `tenant_user_id` VARCHAR(100) NULL AFTER `union_id`,
  ADD COLUMN `tenant_key` VARCHAR(100) NULL AFTER `tenant_user_id`;

UPDATE `external_identities`
SET `open_id` = `external_user_id`
WHERE `provider` = 'FEISHU' AND `identifier_type` = 'OPEN_ID';

CREATE UNIQUE INDEX `external_identities_provider_open_id_uq`
  ON `external_identities`(`provider`, `open_id`);
CREATE UNIQUE INDEX `external_identities_provider_union_id_uq`
  ON `external_identities`(`provider`, `union_id`);
CREATE UNIQUE INDEX `external_identities_provider_tenant_user_id_uq`
  ON `external_identities`(`provider`, `tenant_user_id`);

ALTER TABLE `departments`
  ADD COLUMN `external_provider` VARCHAR(20) NULL AFTER `sort_order`,
  ADD COLUMN `external_department_id` VARCHAR(100) NULL AFTER `external_provider`,
  ADD COLUMN `external_managed` BOOLEAN NOT NULL DEFAULT FALSE AFTER `external_department_id`,
  ADD COLUMN `last_synced_at` DATETIME(3) NULL AFTER `external_managed`;

CREATE UNIQUE INDEX `departments_external_provider_id_uq`
  ON `departments`(`external_provider`, `external_department_id`);

CREATE TABLE `user_department_memberships` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `department_id` VARCHAR(36) NOT NULL,
  `source` VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  `is_primary` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `user_department_memberships_user_department_uq`(`user_id`, `department_id`),
  INDEX `user_department_memberships_department_user_idx`(`department_id`, `user_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `user_department_memberships_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `user_department_memberships_department_id_fkey`
    FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `user_department_memberships`
  (`id`, `user_id`, `department_id`, `source`, `is_primary`, `created_at`, `updated_at`)
SELECT UUID(), `id`, `department_id`, 'LEGACY', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `users`
WHERE `department_id` IS NOT NULL;

CREATE TABLE `user_permission_overrides` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `permission_id` VARCHAR(36) NOT NULL,
  `effect` ENUM('ALLOW', 'DENY') NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `user_permission_overrides_user_permission_uq`(`user_id`, `permission_id`),
  INDEX `user_permission_overrides_user_effect_idx`(`user_id`, `effect`),
  PRIMARY KEY (`id`),
  CONSTRAINT `user_permission_overrides_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `user_permission_overrides_permission_id_fkey`
    FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `department_permission_grants` (
  `id` VARCHAR(36) NOT NULL,
  `department_id` VARCHAR(36) NOT NULL,
  `permission_id` VARCHAR(36) NOT NULL,
  `effect` ENUM('ALLOW', 'DENY') NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `department_permission_grants_department_permission_uq`(`department_id`, `permission_id`),
  INDEX `department_permission_grants_department_effect_idx`(`department_id`, `effect`),
  PRIMARY KEY (`id`),
  CONSTRAINT `department_permission_grants_department_id_fkey`
    FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `department_permission_grants_permission_id_fkey`
    FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
