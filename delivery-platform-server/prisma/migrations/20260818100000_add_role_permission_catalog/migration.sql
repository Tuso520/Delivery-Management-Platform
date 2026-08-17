-- Protect the built-in super administrator and persist presentation metadata
-- used by the hierarchical role-permission matrix.
ALTER TABLE `roles`
  ADD COLUMN `is_protected` BOOLEAN NOT NULL DEFAULT false AFTER `default_data_scope`;

UPDATE `roles`
SET `is_protected` = true,
    `status` = 'Active'
WHERE `role_code` = 'SUPER_ADMIN';

ALTER TABLE `permissions`
  ADD COLUMN `module_code` VARCHAR(50) NOT NULL DEFAULT 'other' AFTER `action`,
  ADD COLUMN `module_name` VARCHAR(50) NOT NULL DEFAULT '其他' AFTER `module_code`,
  ADD COLUMN `page_code` VARCHAR(50) NOT NULL DEFAULT 'other' AFTER `module_name`,
  ADD COLUMN `page_name` VARCHAR(50) NOT NULL DEFAULT '其他' AFTER `page_code`,
  ADD COLUMN `action_group` VARCHAR(20) NOT NULL DEFAULT 'OPERATE' AFTER `page_name`,
  ADD COLUMN `sort_order` INTEGER NOT NULL DEFAULT 0 AFTER `action_group`;

CREATE INDEX `permissions_catalog_order_idx`
  ON `permissions`(`module_code`, `page_code`, `sort_order`);
