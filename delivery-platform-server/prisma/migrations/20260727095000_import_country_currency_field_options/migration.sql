INSERT INTO `dictionary_categories` (
  `id`,
  `category_code`,
  `category_name`,
  `field_type`,
  `required`,
  `default_value`,
  `visible_scopes`,
  `permissions`,
  `description`,
  `is_system`,
  `status`,
  `sort_order`,
  `revision`,
  `created_at`,
  `updated_at`
)
SELECT
  UUID(),
  'COUNTRY',
  '国家',
  'SINGLE_SELECT',
  TRUE,
  JSON_QUOTE('CN'),
  JSON_ARRAY('project', 'archive-template', 'approval'),
  JSON_OBJECT('view', JSON_ARRAY(), 'edit', JSON_ARRAY('field_setting:edit')),
  '国家字段唯一配置源',
  TRUE,
  'Active',
  10,
  1,
  NOW(3),
  NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM `dictionary_categories` WHERE `category_code` = 'COUNTRY'
);

INSERT INTO `dictionary_categories` (
  `id`,
  `category_code`,
  `category_name`,
  `field_type`,
  `required`,
  `default_value`,
  `visible_scopes`,
  `permissions`,
  `description`,
  `is_system`,
  `status`,
  `sort_order`,
  `revision`,
  `created_at`,
  `updated_at`
)
SELECT
  UUID(),
  'CURRENCY',
  '合同币种',
  'SINGLE_SELECT',
  FALSE,
  JSON_QUOTE('CNY'),
  JSON_ARRAY('project', 'currency', 'payment'),
  JSON_OBJECT('view', JSON_ARRAY(), 'edit', JSON_ARRAY('field_setting:edit')),
  '币种字段唯一配置源；汇率元数据仍由 currencies 表保存',
  TRUE,
  'Active',
  60,
  1,
  NOW(3),
  NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM `dictionary_categories` WHERE `category_code` = 'CURRENCY'
);

INSERT INTO `dictionary_items` (
  `id`,
  `category_id`,
  `item_value`,
  `item_label`,
  `item_code`,
  `status`,
  `sort_order`,
  `is_system_default`,
  `created_at`,
  `updated_at`
)
SELECT
  UUID(),
  `field`.`id`,
  `country`.`country_code`,
  `country`.`name_zh`,
  `country`.`country_code`,
  `country`.`status`,
  1000,
  FALSE,
  NOW(3),
  NOW(3)
FROM `countries` AS `country`
JOIN `dictionary_categories` AS `field`
  ON `field`.`category_code` = 'COUNTRY'
WHERE NOT EXISTS (
  SELECT 1
  FROM `dictionary_items` AS `field_option`
  WHERE `field_option`.`category_id` = `field`.`id`
    AND `field_option`.`item_value` = `country`.`country_code`
);

INSERT INTO `dictionary_items` (
  `id`,
  `category_id`,
  `item_value`,
  `item_label`,
  `item_code`,
  `status`,
  `sort_order`,
  `is_system_default`,
  `created_at`,
  `updated_at`
)
SELECT
  UUID(),
  `field`.`id`,
  `currency`.`currency_code`,
  `currency`.`currency_name`,
  `currency`.`currency_code`,
  `currency`.`status`,
  1000,
  FALSE,
  NOW(3),
  NOW(3)
FROM `currencies` AS `currency`
JOIN `dictionary_categories` AS `field`
  ON `field`.`category_code` = 'CURRENCY'
WHERE NOT EXISTS (
  SELECT 1
  FROM `dictionary_items` AS `field_option`
  WHERE `field_option`.`category_id` = `field`.`id`
    AND `field_option`.`item_value` = `currency`.`currency_code`
);
