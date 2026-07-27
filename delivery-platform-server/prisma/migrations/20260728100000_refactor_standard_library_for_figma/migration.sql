ALTER TABLE `standards`
  ADD COLUMN `delivery_stage_code` VARCHAR(100) NULL,
  ADD COLUMN `management_domain_code` VARCHAR(100) NULL,
  ADD COLUMN `business_type_code` VARCHAR(100) NULL,
  ADD COLUMN `is_enabled` BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX `standards_delivery_stage_enabled_idx`
  ON `standards` (`delivery_stage_code`, `is_enabled`);
CREATE INDEX `standards_management_domain_enabled_idx`
  ON `standards` (`management_domain_code`, `is_enabled`);
CREATE INDEX `standards_business_type_code_idx`
  ON `standards` (`business_type_code`);

CREATE TABLE `standard_countries` (
  `standard_id` VARCHAR(36) NOT NULL,
  `country_code` VARCHAR(10) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`standard_id`, `country_code`),
  INDEX `standard_countries_country_code_idx` (`country_code`),
  CONSTRAINT `standard_countries_standard_id_fkey`
    FOREIGN KEY (`standard_id`) REFERENCES `standards` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `standard_countries_country_code_fkey`
    FOREIGN KEY (`country_code`) REFERENCES `countries` (`country_code`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

UPDATE `standards`
SET `type` = CASE
  WHEN `type` = 'PROCESS' THEN 'DELIVERY_WORKFLOW'
  WHEN `type` = 'CHECKLIST' THEN 'CHECK_STANDARD'
  WHEN `type` = 'POLICY' THEN 'MANAGEMENT_POLICY'
  ELSE `type`
END;

UPDATE `standards`
SET
  `delivery_stage_code` = CASE
    WHEN `category` IN ('PROJECT_STARTUP', '项目启动') THEN 'PROJECT_STARTUP'
    WHEN `category` IN ('DETAILED_DESIGN', '深化设计') THEN 'DETAILED_DESIGN'
    WHEN `category` IN ('PROCUREMENT_PRODUCTION', '采购与生产') THEN 'PROCUREMENT_PRODUCTION'
    WHEN `category` IN ('CONSTRUCTION_INSTALLATION', '施工安装', '施工与安装', '安全记录') THEN 'CONSTRUCTION_INSTALLATION'
    WHEN `category` IN ('HARDWARE_COMMISSIONING', '系统调试', '调试记录') THEN 'HARDWARE_COMMISSIONING'
    WHEN `category` IN ('SOFTWARE_TESTING', '软件测试', '测试验证') THEN 'SOFTWARE_TESTING'
    WHEN `category` IN ('INTERNAL_ACCEPTANCE', '内部验收') THEN 'INTERNAL_ACCEPTANCE'
    WHEN `category` IN ('CUSTOMER_ACCEPTANCE', '客户验收') THEN 'CUSTOMER_ACCEPTANCE'
    WHEN `category` IN ('CLOSEOUT_HANDOVER', '验收收尾', '验收移交', '收尾与移交') THEN 'CLOSEOUT_HANDOVER'
    WHEN `category` IN ('WARRANTY_REVIEW', '质保收尾', '维保与复盘') THEN 'WARRANTY_REVIEW'
    ELSE 'PROJECT_STARTUP'
  END,
  `management_domain_code` = CASE
    WHEN `category` IN (
      'MANAGEMENT_POLICY',
      'ROLES_RESPONSIBILITIES',
      'PROCESS_SOP',
      'TECH_PRODUCT_STANDARD',
      'WORK_SPECIFICATION',
      'INSPECTION_ACCEPTANCE',
      'TEMPLATE_FORM'
    ) THEN `category`
    ELSE NULL
  END,
  `business_type_code` = 'GENERAL',
  `is_enabled` = CASE WHEN `archived_at` IS NULL THEN TRUE ELSE FALSE END;

DROP INDEX `standards_category_idx` ON `standards`;
ALTER TABLE `standards` DROP COLUMN `category`;

UPDATE `dictionary_categories`
SET
  `visible_scopes` = JSON_ARRAY_APPEND(`visible_scopes`, '$', 'standard'),
  `revision` = `revision` + 1
WHERE `category_code` = 'COUNTRY'
  AND JSON_CONTAINS(`visible_scopes`, JSON_QUOTE('standard')) = 0;

UPDATE `dictionary_categories`
SET
  `status` = 'Inactive',
  `visible_scopes` = JSON_ARRAY(),
  `revision` = `revision` + 1
WHERE `category_code` = 'STANDARD_CATEGORY';

UPDATE `dictionary_categories`
SET `category_code` = 'STANDARD_TYPE'
WHERE BINARY `category_code` = 'standard_type';

UPDATE `dictionary_items` AS `item`
JOIN `dictionary_categories` AS `category`
  ON `category`.`id` = `item`.`category_id`
SET
  `item`.`item_label` = CASE
    WHEN `item`.`item_value` = 'PROCESS' THEN '交付流程'
    WHEN `item`.`item_value` = 'CHECKLIST' THEN '检查标准'
    WHEN `item`.`item_value` = 'POLICY' THEN '管理制度'
    ELSE `item`.`item_label`
  END,
  `item`.`item_code` = CASE
    WHEN `item`.`item_value` = 'PROCESS' THEN 'DELIVERY_WORKFLOW'
    WHEN `item`.`item_value` = 'CHECKLIST' THEN 'CHECK_STANDARD'
    WHEN `item`.`item_value` = 'POLICY' THEN 'MANAGEMENT_POLICY'
    ELSE `item`.`item_value`
  END,
  `item`.`item_value` = CASE
    WHEN `item`.`item_value` = 'PROCESS' THEN 'DELIVERY_WORKFLOW'
    WHEN `item`.`item_value` = 'CHECKLIST' THEN 'CHECK_STANDARD'
    WHEN `item`.`item_value` = 'POLICY' THEN 'MANAGEMENT_POLICY'
    ELSE `item`.`item_value`
  END
WHERE BINARY `category`.`category_code` = 'STANDARD_TYPE';

INSERT INTO `dictionary_categories` (
  `id`, `category_code`, `category_name`, `field_type`, `required`,
  `default_value`, `visible_scopes`, `permissions`, `description`,
  `is_system`, `status`, `sort_order`, `revision`, `created_at`, `updated_at`
)
VALUES
  (UUID(), 'STANDARD_TYPE', '标准类型', 'SINGLE_SELECT', TRUE, JSON_QUOTE('DOCUMENT_TEMPLATE'), JSON_ARRAY('standard'), JSON_OBJECT('view', JSON_ARRAY(), 'edit', JSON_ARRAY('field_setting:edit')), '标准主数据类型，标准库通过稳定编码关联。', TRUE, 'Active', 310, 1, NOW(3), NOW(3)),
  (UUID(), 'STANDARD_DELIVERY_STAGE', '交付阶段', 'SINGLE_SELECT', TRUE, JSON_QUOTE('PROJECT_STARTUP'), JSON_ARRAY('standard'), JSON_OBJECT('view', JSON_ARRAY(), 'edit', JSON_ARRAY('field_setting:edit')), '标准库左侧交付阶段分类。', TRUE, 'Active', 320, 1, NOW(3), NOW(3)),
  (UUID(), 'STANDARD_MANAGEMENT_DOMAIN', '管理领域', 'SINGLE_SELECT', FALSE, NULL, JSON_ARRAY('standard'), JSON_OBJECT('view', JSON_ARRAY(), 'edit', JSON_ARRAY('field_setting:edit')), '标准库左侧管理领域分类。', TRUE, 'Active', 330, 1, NOW(3), NOW(3)),
  (UUID(), 'STANDARD_BUSINESS_TYPE', '业务类型', 'SINGLE_SELECT', FALSE, JSON_QUOTE('GENERAL'), JSON_ARRAY('standard'), JSON_OBJECT('view', JSON_ARRAY(), 'edit', JSON_ARRAY('field_setting:edit')), '标准适用业务类型。', TRUE, 'Active', 340, 1, NOW(3), NOW(3)),
  (UUID(), 'STANDARD_STATUS', '状态', 'SINGLE_SELECT', TRUE, JSON_QUOTE('DRAFT'), JSON_ARRAY('standard'), JSON_OBJECT('view', JSON_ARRAY(), 'edit', JSON_ARRAY('field_setting:edit')), '标准与标准版本状态显示配置。', TRUE, 'Active', 350, 1, NOW(3), NOW(3)),
  (UUID(), 'STANDARD_ENABLED_STATUS', '启用状态', 'SINGLE_SELECT', TRUE, JSON_QUOTE('ENABLED'), JSON_ARRAY('standard'), JSON_OBJECT('view', JSON_ARRAY(), 'edit', JSON_ARRAY('field_setting:edit')), '标准启用状态显示配置。', TRUE, 'Active', 360, 1, NOW(3), NOW(3)),
  (UUID(), 'STANDARD_CURRENT_VERSION', '当前版本', 'TEXT', FALSE, JSON_QUOTE('V1.0'), JSON_ARRAY('standard'), JSON_OBJECT('view', JSON_ARRAY(), 'edit', JSON_ARRAY('field_setting:edit')), '标准当前版本字段。', TRUE, 'Active', 370, 1, NOW(3), NOW(3)),
  (UUID(), 'STANDARD_EFFECTIVE_DATE', '生效日期', 'DATE', FALSE, NULL, JSON_ARRAY('standard'), JSON_OBJECT('view', JSON_ARRAY(), 'edit', JSON_ARRAY('field_setting:edit')), '标准生效日期字段。', TRUE, 'Active', 380, 1, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  `category_name` = VALUES(`category_name`),
  `field_type` = VALUES(`field_type`),
  `required` = VALUES(`required`),
  `visible_scopes` = VALUES(`visible_scopes`),
  `permissions` = VALUES(`permissions`),
  `description` = VALUES(`description`),
  `is_system` = TRUE,
  `status` = 'Active';

INSERT INTO `dictionary_items` (
  `id`, `category_id`, `item_value`, `item_label`, `item_code`, `description`,
  `status`, `sort_order`, `is_system_default`, `created_at`, `updated_at`
)
SELECT UUID(), `category`.`id`, `seed`.`item_value`, `seed`.`item_label`,
  `seed`.`item_value`, `seed`.`description`, 'Active', `seed`.`sort_order`,
  `seed`.`is_default`, NOW(3), NOW(3)
FROM `dictionary_categories` AS `category`
JOIN (
  SELECT 'STANDARD_TYPE' AS `category_code`, 'SOP' AS `item_value`, 'SOP' AS `item_label`, NULL AS `description`, 10 AS `sort_order`, FALSE AS `is_default`
  UNION ALL SELECT 'STANDARD_TYPE', 'MANAGEMENT_POLICY', '管理制度', NULL, 20, FALSE
  UNION ALL SELECT 'STANDARD_TYPE', 'DELIVERY_WORKFLOW', '交付流程', NULL, 30, FALSE
  UNION ALL SELECT 'STANDARD_TYPE', 'CHECK_STANDARD', '检查标准', NULL, 40, FALSE
  UNION ALL SELECT 'STANDARD_TYPE', 'DOCUMENT_TEMPLATE', '文档模板', NULL, 50, TRUE
  UNION ALL SELECT 'STANDARD_TYPE', 'FORM_TEMPLATE', '表单模板', NULL, 60, FALSE
  UNION ALL SELECT 'STANDARD_TYPE', 'TECHNICAL_STANDARD', '技术标准', NULL, 70, FALSE
  UNION ALL SELECT 'STANDARD_TYPE', 'WORK_INSTRUCTION', '作业指导书', NULL, 80, FALSE

  UNION ALL SELECT 'STANDARD_DELIVERY_STAGE', 'PROJECT_STARTUP', '项目启动', '完成项目交接、团队组建、目标确认、计划编制、风险识别及启动会组织。', 10, TRUE
  UNION ALL SELECT 'STANDARD_DELIVERY_STAGE', 'DETAILED_DESIGN', '深化设计', NULL, 20, FALSE
  UNION ALL SELECT 'STANDARD_DELIVERY_STAGE', 'PROCUREMENT_PRODUCTION', '采购与生产', NULL, 30, FALSE
  UNION ALL SELECT 'STANDARD_DELIVERY_STAGE', 'CONSTRUCTION_INSTALLATION', '施工与安装', NULL, 40, FALSE
  UNION ALL SELECT 'STANDARD_DELIVERY_STAGE', 'HARDWARE_COMMISSIONING', '硬件调试', NULL, 50, FALSE
  UNION ALL SELECT 'STANDARD_DELIVERY_STAGE', 'SOFTWARE_TESTING', '软件测试', NULL, 60, FALSE
  UNION ALL SELECT 'STANDARD_DELIVERY_STAGE', 'INTERNAL_ACCEPTANCE', '内部验收', NULL, 70, FALSE
  UNION ALL SELECT 'STANDARD_DELIVERY_STAGE', 'CUSTOMER_ACCEPTANCE', '客户验收', NULL, 80, FALSE
  UNION ALL SELECT 'STANDARD_DELIVERY_STAGE', 'CLOSEOUT_HANDOVER', '收尾与移交', NULL, 90, FALSE
  UNION ALL SELECT 'STANDARD_DELIVERY_STAGE', 'WARRANTY_REVIEW', '维保与复盘', NULL, 100, FALSE

  UNION ALL SELECT 'STANDARD_MANAGEMENT_DOMAIN', 'MANAGEMENT_POLICY', '管理制度', NULL, 10, FALSE
  UNION ALL SELECT 'STANDARD_MANAGEMENT_DOMAIN', 'ROLES_RESPONSIBILITIES', '岗位与职责', NULL, 20, FALSE
  UNION ALL SELECT 'STANDARD_MANAGEMENT_DOMAIN', 'PROCESS_SOP', '流程与 SOP', NULL, 30, FALSE
  UNION ALL SELECT 'STANDARD_MANAGEMENT_DOMAIN', 'TECH_PRODUCT_STANDARD', '技术与产品标准', NULL, 40, FALSE
  UNION ALL SELECT 'STANDARD_MANAGEMENT_DOMAIN', 'WORK_SPECIFICATION', '作业规范', NULL, 50, FALSE
  UNION ALL SELECT 'STANDARD_MANAGEMENT_DOMAIN', 'INSPECTION_ACCEPTANCE', '检查与验收', NULL, 60, FALSE
  UNION ALL SELECT 'STANDARD_MANAGEMENT_DOMAIN', 'TEMPLATE_FORM', '模板与表单', NULL, 70, FALSE

  UNION ALL SELECT 'STANDARD_BUSINESS_TYPE', 'GENERAL', '通用', NULL, 10, TRUE

  UNION ALL SELECT 'STANDARD_STATUS', 'DRAFT', '草稿', NULL, 10, TRUE
  UNION ALL SELECT 'STANDARD_STATUS', 'IN_REVIEW', '审核中', NULL, 20, FALSE
  UNION ALL SELECT 'STANDARD_STATUS', 'REJECTED', '已驳回', NULL, 30, FALSE
  UNION ALL SELECT 'STANDARD_STATUS', 'PUBLISHED', '已发布', NULL, 40, FALSE
  UNION ALL SELECT 'STANDARD_STATUS', 'ARCHIVED', '已归档', NULL, 50, FALSE

  UNION ALL SELECT 'STANDARD_ENABLED_STATUS', 'ENABLED', '启用', NULL, 10, TRUE
  UNION ALL SELECT 'STANDARD_ENABLED_STATUS', 'DISABLED', '停用', NULL, 20, FALSE
) AS `seed` ON `seed`.`category_code` = `category`.`category_code`
ON DUPLICATE KEY UPDATE
  `item_code` = VALUES(`item_code`),
  `description` = VALUES(`description`),
  `status` = 'Active',
  `is_system_default` = VALUES(`is_system_default`);
