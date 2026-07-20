ALTER TABLE `dictionary_categories`
  ADD COLUMN `created_by` VARCHAR(36) NULL AFTER `sort_order`,
  ADD COLUMN `updated_by` VARCHAR(36) NULL AFTER `created_by`;

ALTER TABLE `dictionary_items`
  ADD COLUMN `description` VARCHAR(300) NULL AFTER `item_code`,
  ADD COLUMN `deleted_at` DATETIME(3) NULL AFTER `updated_by`;

CREATE INDEX `dictionary_items_category_status_deleted_idx`
  ON `dictionary_items`(`category_id`, `status`, `deleted_at`);
