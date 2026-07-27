ALTER TABLE `dictionary_categories`
  ADD COLUMN `field_type` VARCHAR(30) NOT NULL DEFAULT 'SINGLE_SELECT' AFTER `category_name`,
  ADD COLUMN `required` BOOLEAN NOT NULL DEFAULT FALSE AFTER `field_type`,
  ADD COLUMN `default_value` JSON NULL AFTER `required`,
  ADD COLUMN `visible_scopes` JSON NULL AFTER `default_value`,
  ADD COLUMN `permissions` JSON NULL AFTER `visible_scopes`,
  ADD COLUMN `revision` INT NOT NULL DEFAULT 1 AFTER `sort_order`;

UPDATE `dictionary_categories`
SET
  `field_type` = CASE
    WHEN `category_code` = 'PROJECT_KEYWORD' THEN 'MULTI_SELECT'
    ELSE 'SINGLE_SELECT'
  END,
  `required` = CASE
    WHEN `category_code` IN ('COUNTRY', 'CUSTOMER_TYPE', 'CONTRACT_TYPE', 'STANDARD_CATEGORY', 'KNOWLEDGE_CATEGORY') THEN TRUE
    ELSE FALSE
  END,
  `default_value` = CASE `category_code`
    WHEN 'COUNTRY' THEN JSON_QUOTE('CN')
    WHEN 'CURRENCY' THEN JSON_QUOTE('CNY')
    WHEN 'PROJECT_STAGE' THEN JSON_QUOTE('STARTUP')
    WHEN 'PROJECT_STATUS' THEN JSON_QUOTE('ACTIVE')
    ELSE NULL
  END,
  `visible_scopes` = CASE `category_code`
    WHEN 'COUNTRY' THEN JSON_ARRAY('project', 'archive-template', 'approval')
    WHEN 'CUSTOMER_TYPE' THEN JSON_ARRAY('project', 'archive-template', 'checklist-template', 'document-template')
    WHEN 'CONTRACT_TYPE' THEN JSON_ARRAY('project')
    WHEN 'PRODUCT_TYPE' THEN JSON_ARRAY('project')
    WHEN 'PROJECT_KEYWORD' THEN JSON_ARRAY('project')
    WHEN 'CURRENCY' THEN JSON_ARRAY('project', 'currency', 'payment')
    WHEN 'PROJECT_STAGE' THEN JSON_ARRAY('project', 'dashboard', 'checklist-template', 'document-template')
    WHEN 'PROJECT_STATUS' THEN JSON_ARRAY('project', 'dashboard')
    WHEN 'STANDARD_CATEGORY' THEN JSON_ARRAY('standard')
    WHEN 'KNOWLEDGE_CATEGORY' THEN JSON_ARRAY('knowledge')
    WHEN 'JOB_POSITION' THEN JSON_ARRAY('identity', 'project')
    WHEN 'PROJECT_TYPE' THEN JSON_ARRAY('project', 'archive-template')
    ELSE JSON_ARRAY()
  END,
  `permissions` = JSON_OBJECT(
    'view', JSON_ARRAY(),
    'edit', JSON_ARRAY('field_setting:edit')
  )
WHERE `category_code` IN (
  'COUNTRY',
  'CUSTOMER_TYPE',
  'CONTRACT_TYPE',
  'PRODUCT_TYPE',
  'PROJECT_KEYWORD',
  'CURRENCY',
  'PROJECT_STAGE',
  'PROJECT_STATUS',
  'STANDARD_CATEGORY',
  'KNOWLEDGE_CATEGORY',
  'JOB_POSITION',
  'PROJECT_TYPE'
);

UPDATE `dictionary_categories`
SET
  `visible_scopes` = COALESCE(`visible_scopes`, JSON_ARRAY()),
  `permissions` = COALESCE(
    `permissions`,
    JSON_OBJECT('view', JSON_ARRAY(), 'edit', JSON_ARRAY('field_setting:edit'))
  );

ALTER TABLE `dictionary_categories`
  MODIFY COLUMN `visible_scopes` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  MODIFY COLUMN `permissions` JSON NOT NULL DEFAULT (JSON_OBJECT());
