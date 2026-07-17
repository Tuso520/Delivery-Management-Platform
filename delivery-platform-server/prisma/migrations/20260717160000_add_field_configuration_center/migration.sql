ALTER TABLE `dictionary_categories`
  ADD COLUMN `is_system` BOOLEAN NOT NULL DEFAULT false AFTER `description`;

ALTER TABLE `dictionary_items`
  ADD COLUMN `item_code` VARCHAR(100) NULL AFTER `item_label`,
  ADD COLUMN `is_system_default` BOOLEAN NOT NULL DEFAULT false AFTER `sort_order`,
  ADD COLUMN `created_by` VARCHAR(36) NULL AFTER `is_system_default`,
  ADD COLUMN `updated_by` VARCHAR(36) NULL AFTER `created_by`;

UPDATE `dictionary_categories` SET `category_code` = 'CUSTOMER_TYPE', `category_name` = '客户类型', `is_system` = true
WHERE `category_code` = 'project_type';
UPDATE `dictionary_categories` SET `category_code` = 'CONTRACT_TYPE', `category_name` = '合同类型', `is_system` = true
WHERE `category_code` = 'contract_type';
UPDATE `dictionary_categories` SET `category_code` = 'PRODUCT_TYPE', `category_name` = '产品类型', `is_system` = true
WHERE `category_code` = 'product_type';
UPDATE `dictionary_categories` SET `category_code` = 'PROJECT_KEYWORD', `category_name` = '项目关键词', `is_system` = true
WHERE `category_code` = 'project_keyword';
UPDATE `dictionary_categories` SET `category_code` = 'PROJECT_STATUS', `category_name` = '项目状态', `is_system` = true
WHERE `category_code` = 'project_lifecycle_status';
UPDATE `dictionary_categories` SET `category_code` = 'PROJECT_STAGE', `category_name` = '项目阶段', `is_system` = true
WHERE `category_code` = 'project_delivery_stage';

UPDATE `dictionary_items` item
JOIN `dictionary_categories` category ON category.`id` = item.`category_id`
SET item.`item_code` = item.`item_value`, item.`is_system_default` = true
WHERE category.`category_code` IN ('CUSTOMER_TYPE', 'CONTRACT_TYPE', 'PRODUCT_TYPE', 'PROJECT_KEYWORD', 'PROJECT_STATUS', 'PROJECT_STAGE');

CREATE UNIQUE INDEX `dictionary_items_category_label_uq`
  ON `dictionary_items`(`category_id`, `item_label`);
CREATE UNIQUE INDEX `dictionary_items_category_code_uq`
  ON `dictionary_items`(`category_id`, `item_code`);
