-- Align the active knowledge-category field options with Figma node 125:624.
-- Existing option ids are retained for the first six rows so historical
-- KnowledgeItem foreign keys remain valid while their stable codes are renamed.
UPDATE `dictionary_items` AS `item`
JOIN `dictionary_categories` AS `field`
  ON `field`.`id` = `item`.`category_id`
  AND `field`.`category_code` = 'KNOWLEDGE_CATEGORY'
SET
  `item`.`item_value` = CASE `item`.`item_value`
    WHEN 'PROJECT_CASE_REVIEW' THEN 'JOB_RESPONSIBILITY_CAPABILITY'
    WHEN 'BEST_PRACTICE' THEN 'PROJECT_MANAGEMENT_STANDARD'
    WHEN 'FAQ_TROUBLESHOOTING' THEN 'ELECTRICAL_AUTOMATION'
    WHEN 'TRAINING_TUTORIAL' THEN 'SOFTWARE_PLATFORM'
    WHEN 'EXTERNAL_STANDARD' THEN 'CONSTRUCTION_SAFETY'
    WHEN 'RESOURCE_TOOL' THEN 'COMMISSIONING_ACCEPTANCE'
    ELSE `item`.`item_value`
  END,
  `item`.`item_code` = CASE `item`.`item_code`
    WHEN 'PROJECT_CASE_REVIEW' THEN 'JOB_RESPONSIBILITY_CAPABILITY'
    WHEN 'BEST_PRACTICE' THEN 'PROJECT_MANAGEMENT_STANDARD'
    WHEN 'FAQ_TROUBLESHOOTING' THEN 'ELECTRICAL_AUTOMATION'
    WHEN 'TRAINING_TUTORIAL' THEN 'SOFTWARE_PLATFORM'
    WHEN 'EXTERNAL_STANDARD' THEN 'CONSTRUCTION_SAFETY'
    WHEN 'RESOURCE_TOOL' THEN 'COMMISSIONING_ACCEPTANCE'
    ELSE `item`.`item_code`
  END,
  `item`.`item_label` = CASE `item`.`item_value`
    WHEN 'PROJECT_CASE_REVIEW' THEN '岗位职责与能力'
    WHEN 'JOB_RESPONSIBILITY_CAPABILITY' THEN '岗位职责与能力'
    WHEN 'BEST_PRACTICE' THEN '项目管理规范'
    WHEN 'PROJECT_MANAGEMENT_STANDARD' THEN '项目管理规范'
    WHEN 'FAQ_TROUBLESHOOTING' THEN '电气与自动化'
    WHEN 'ELECTRICAL_AUTOMATION' THEN '电气与自动化'
    WHEN 'TRAINING_TUTORIAL' THEN '软件与平台'
    WHEN 'SOFTWARE_PLATFORM' THEN '软件与平台'
    WHEN 'EXTERNAL_STANDARD' THEN '施工与安全'
    WHEN 'CONSTRUCTION_SAFETY' THEN '施工与安全'
    WHEN 'RESOURCE_TOOL' THEN '调试与验收'
    WHEN 'COMMISSIONING_ACCEPTANCE' THEN '调试与验收'
    ELSE `item`.`item_label`
  END,
  `item`.`description` = CASE `item`.`item_value`
    WHEN 'PROJECT_CASE_REVIEW'
      THEN '项目经理、电气、软件、运维等岗位职责、能力模型及技能评估要求。'
    WHEN 'JOB_RESPONSIBILITY_CAPABILITY'
      THEN '项目经理、电气、软件、运维等岗位职责、能力模型及技能评估要求。'
    ELSE `item`.`description`
  END,
  `item`.`sort_order` = CASE `item`.`item_value`
    WHEN 'PROJECT_CASE_REVIEW' THEN 10
    WHEN 'JOB_RESPONSIBILITY_CAPABILITY' THEN 10
    WHEN 'BEST_PRACTICE' THEN 20
    WHEN 'PROJECT_MANAGEMENT_STANDARD' THEN 20
    WHEN 'FAQ_TROUBLESHOOTING' THEN 30
    WHEN 'ELECTRICAL_AUTOMATION' THEN 30
    WHEN 'TRAINING_TUTORIAL' THEN 40
    WHEN 'SOFTWARE_PLATFORM' THEN 40
    WHEN 'EXTERNAL_STANDARD' THEN 50
    WHEN 'CONSTRUCTION_SAFETY' THEN 50
    WHEN 'RESOURCE_TOOL' THEN 60
    WHEN 'COMMISSIONING_ACCEPTANCE' THEN 60
    ELSE `item`.`sort_order`
  END,
  `item`.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE `item`.`item_value` IN (
  'PROJECT_CASE_REVIEW',
  'BEST_PRACTICE',
  'FAQ_TROUBLESHOOTING',
  'TRAINING_TUTORIAL',
  'EXTERNAL_STANDARD',
  'RESOURCE_TOOL'
);

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
  `created_by`,
  `updated_by`,
  `created_at`,
  `updated_at`
)
SELECT
  UUID(),
  `field`.`id`,
  `seed`.`item_value`,
  `seed`.`item_label`,
  `seed`.`item_value`,
  `seed`.`description`,
  'Active',
  `seed`.`sort_order`,
  TRUE,
  `field`.`created_by`,
  `field`.`updated_by`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `dictionary_categories` AS `field`
JOIN (
  SELECT
    'OPERATIONS_REMOTE_SUPPORT' AS `item_value`,
    '运维与远程支持' AS `item_label`,
    CAST(NULL AS CHAR(300)) AS `description`,
    70 AS `sort_order`
  UNION ALL
  SELECT 'TECHNICAL_DOCUMENT_DELIVERABLE', '技术文档与成果物', NULL, 80
  UNION ALL
  SELECT 'TECHNICAL_RESOURCE_SUPPLY_CHAIN', '技术资源与供应链', NULL, 90
  UNION ALL
  SELECT 'OVERSEAS_DELIVERY_SUPPORT', '海外交付支持', NULL, 100
) AS `seed`
WHERE `field`.`category_code` = 'KNOWLEDGE_CATEGORY'
  AND NOT EXISTS (
    SELECT 1
    FROM `dictionary_items` AS `existing`
    WHERE `existing`.`category_id` = `field`.`id`
      AND `existing`.`item_value` = `seed`.`item_value`
  );

UPDATE `knowledge_categories` AS `category`
JOIN `dictionary_items` AS `item`
  ON `item`.`id` = `category`.`field_option_id`
JOIN `dictionary_categories` AS `field`
  ON `field`.`id` = `item`.`category_id`
  AND `field`.`category_code` = 'KNOWLEDGE_CATEGORY'
SET
  `category`.`name` = `item`.`item_label`,
  `category`.`description` = `item`.`description`,
  `category`.`sort_order` = `item`.`sort_order`,
  `category`.`status` = `item`.`status`,
  `category`.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE `item`.`item_value` IN (
  'JOB_RESPONSIBILITY_CAPABILITY',
  'PROJECT_MANAGEMENT_STANDARD',
  'ELECTRICAL_AUTOMATION',
  'SOFTWARE_PLATFORM',
  'CONSTRUCTION_SAFETY',
  'COMMISSIONING_ACCEPTANCE'
);

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
  `item`.`id`,
  `item`.`item_label`,
  `item`.`description`,
  NULL,
  `item`.`id`,
  `item`.`sort_order`,
  `item`.`status`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `dictionary_items` AS `item`
JOIN `dictionary_categories` AS `field`
  ON `field`.`id` = `item`.`category_id`
  AND `field`.`category_code` = 'KNOWLEDGE_CATEGORY'
WHERE `item`.`item_value` IN (
  'OPERATIONS_REMOTE_SUPPORT',
  'TECHNICAL_DOCUMENT_DELIVERABLE',
  'TECHNICAL_RESOURCE_SUPPLY_CHAIN',
  'OVERSEAS_DELIVERY_SUPPORT'
)
  AND NOT EXISTS (
    SELECT 1
    FROM `knowledge_categories` AS `existing`
    WHERE `existing`.`id` = `item`.`id`
  );

-- Target knowledge seed rows carry their catalog module id in the published
-- version snapshot. Move only those deterministic sample rows to the new
-- configured categories; user-created historical categories are untouched.
UPDATE `knowledge_items` AS `knowledge`
JOIN `knowledge_versions_v2` AS `version`
  ON `version`.`knowledge_item_id` = `knowledge`.`id`
  AND JSON_EXTRACT(`version`.`legacy_snapshot`, '$.catalogModuleId') IS NOT NULL
JOIN `dictionary_categories` AS `field`
  ON `field`.`category_code` = 'KNOWLEDGE_CATEGORY'
JOIN `dictionary_items` AS `item`
  ON `item`.`category_id` = `field`.`id`
  AND `item`.`item_value` = CASE JSON_UNQUOTE(
    JSON_EXTRACT(`version`.`legacy_snapshot`, '$.catalogModuleId')
  )
    WHEN 'project-manager' THEN 'JOB_RESPONSIBILITY_CAPABILITY'
    WHEN 'electrical-engineer' THEN 'ELECTRICAL_AUTOMATION'
    WHEN 'software-engineer' THEN 'SOFTWARE_PLATFORM'
    WHEN 'operations-management' THEN 'OPERATIONS_REMOTE_SUPPORT'
    WHEN 'general-requirements' THEN 'TECHNICAL_DOCUMENT_DELIVERABLE'
    WHEN 'technical-standard' THEN 'PROJECT_MANAGEMENT_STANDARD'
    WHEN 'debug-management' THEN 'COMMISSIONING_ACCEPTANCE'
    WHEN 'safety-civilized-construction' THEN 'CONSTRUCTION_SAFETY'
    WHEN 'customer-management' THEN 'PROJECT_MANAGEMENT_STANDARD'
    WHEN 'cross-cultural-communication' THEN 'OVERSEAS_DELIVERY_SUPPORT'
    WHEN 'logistics-management' THEN 'TECHNICAL_RESOURCE_SUPPLY_CHAIN'
    WHEN 'supplier-management' THEN 'TECHNICAL_RESOURCE_SUPPLY_CHAIN'
    ELSE NULL
  END
SET
  `knowledge`.`category_id` = `item`.`id`,
  `knowledge`.`updated_at` = CURRENT_TIMESTAMP(3);
