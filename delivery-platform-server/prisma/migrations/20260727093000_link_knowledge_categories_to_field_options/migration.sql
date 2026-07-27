ALTER TABLE `knowledge_categories`
  ADD COLUMN `field_option_id` VARCHAR(36) NULL;

UPDATE `knowledge_categories` AS `knowledge_category`
JOIN `dictionary_items` AS `field_option`
  ON `knowledge_category`.`id` = `field_option`.`id`
JOIN `dictionary_categories` AS `field`
  ON `field`.`id` = `field_option`.`category_id`
  AND `field`.`category_code` = 'KNOWLEDGE_CATEGORY'
SET `knowledge_category`.`field_option_id` = `field_option`.`id`
WHERE `knowledge_category`.`field_option_id` IS NULL;

INSERT INTO `knowledge_categories` (
  `id`,
  `name`,
  `description`,
  `parent_id`,
  `field_option_id`,
  `sort_order`,
  `status`,
  `created_at`,
  `updated_at`
)
SELECT
  `field_option`.`id`,
  `field_option`.`item_label`,
  `field_option`.`description`,
  NULL,
  `field_option`.`id`,
  `field_option`.`sort_order`,
  `field_option`.`status`,
  NOW(3),
  NOW(3)
FROM `dictionary_items` AS `field_option`
JOIN `dictionary_categories` AS `field`
  ON `field`.`id` = `field_option`.`category_id`
  AND `field`.`category_code` = 'KNOWLEDGE_CATEGORY'
LEFT JOIN `knowledge_categories` AS `knowledge_category`
  ON `knowledge_category`.`field_option_id` = `field_option`.`id`
WHERE `field_option`.`deleted_at` IS NULL
  AND `knowledge_category`.`id` IS NULL;

INSERT INTO `dictionary_items` (
  `id`,
  `category_id`,
  `item_value`,
  `item_label`,
  `item_code`,
  `description`,
  `status`,
  `sort_order`,
  `is_system_default`,
  `created_at`,
  `updated_at`
)
SELECT
  UUID(),
  `field`.`id`,
  CONCAT('LEGACY_', REPLACE(`knowledge_category`.`id`, '-', '')),
  `knowledge_category`.`name`,
  CONCAT('LEGACY_', REPLACE(`knowledge_category`.`id`, '-', '')),
  `knowledge_category`.`description`,
  'Inactive',
  `knowledge_category`.`sort_order`,
  FALSE,
  NOW(3),
  NOW(3)
FROM `knowledge_categories` AS `knowledge_category`
JOIN `dictionary_categories` AS `field`
  ON `field`.`category_code` = 'KNOWLEDGE_CATEGORY'
WHERE `knowledge_category`.`field_option_id` IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `dictionary_items` AS `same_label`
    WHERE `same_label`.`category_id` = `field`.`id`
      AND `same_label`.`item_label` = `knowledge_category`.`name`
  );

ALTER TABLE `knowledge_categories`
  ADD CONSTRAINT `knowledge_categories_field_option_id_key` UNIQUE (`field_option_id`),
  ADD CONSTRAINT `knowledge_categories_field_option_id_fkey`
    FOREIGN KEY (`field_option_id`) REFERENCES `dictionary_items` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
