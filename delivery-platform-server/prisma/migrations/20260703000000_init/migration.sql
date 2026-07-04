-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(50) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `real_name` VARCHAR(50) NOT NULL,
    `email` VARCHAR(100) NULL,
    `phone` VARCHAR(30) NULL,
    `department_id` VARCHAR(36) NULL,
    `status` ENUM('Active', 'Inactive', 'Locked') NOT NULL DEFAULT 'Active',
    `last_login_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    INDEX `users_status_idx`(`status`),
    INDEX `users_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(191) NOT NULL,
    `role_code` VARCHAR(50) NOT NULL,
    `role_name` VARCHAR(50) NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_role_code_key`(`role_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` VARCHAR(191) NOT NULL,
    `permission_code` VARCHAR(100) NOT NULL,
    `permission_name` VARCHAR(50) NOT NULL,
    `resource` VARCHAR(50) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `description` VARCHAR(200) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `permissions_permission_code_key`(`permission_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `role_id` VARCHAR(36) NOT NULL,

    UNIQUE INDEX `user_roles_user_id_role_id_key`(`user_id`, `role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `id` VARCHAR(191) NOT NULL,
    `role_id` VARCHAR(36) NOT NULL,
    `permission_id` VARCHAR(36) NOT NULL,

    UNIQUE INDEX `role_permissions_role_id_permission_id_key`(`role_id`, `permission_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `id` VARCHAR(191) NOT NULL,
    `project_code` VARCHAR(30) NOT NULL,
    `project_name` VARCHAR(200) NOT NULL,
    `country_code` VARCHAR(10) NOT NULL,
    `city` VARCHAR(100) NULL,
    `customer_name` VARCHAR(200) NULL,
    `project_type` VARCHAR(50) NULL,
    `contract_currency` VARCHAR(10) NULL,
    `base_currency` VARCHAR(10) NULL,
    `contract_amount` DECIMAL(18, 2) NULL,
    `exchange_rate` DECIMAL(18, 8) NULL,
    `converted_amount` DECIMAL(18, 2) NULL,
    `exchange_rate_date` DATETIME(3) NULL,
    `exchange_rate_source` VARCHAR(50) NULL,
    `project_language` VARCHAR(10) NULL,
    `project_manager_id` VARCHAR(36) NULL,
    `electric_leader_id` VARCHAR(36) NULL,
    `software_leader_id` VARCHAR(36) NULL,
    `purchase_owner_id` VARCHAR(36) NULL,
    `finance_owner_id` VARCHAR(36) NULL,
    `current_stage` VARCHAR(30) NULL,
    `project_status` ENUM('Draft', 'Active', 'Suspended', 'Delayed', 'Accepted', 'Archived', 'Closed') NOT NULL DEFAULT 'Draft',
    `risk_level` ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL DEFAULT 'Low',
    `start_date` DATETIME(3) NULL,
    `planned_end_date` DATETIME(3) NULL,
    `actual_end_date` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `projects_project_code_key`(`project_code`),
    INDEX `projects_project_status_idx`(`project_status`),
    INDEX `projects_country_code_idx`(`country_code`),
    INDEX `projects_deleted_at_idx`(`deleted_at`),
    INDEX `projects_created_by_idx`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_members` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `project_role` VARCHAR(50) NOT NULL,
    `permission_level` VARCHAR(20) NOT NULL DEFAULT 'Member',
    `data_scope` VARCHAR(20) NOT NULL DEFAULT 'PROJECT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `project_members_project_id_user_id_key`(`project_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_process_records` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `record_type` VARCHAR(30) NOT NULL DEFAULT 'Progress',
    `stage_code` VARCHAR(30) NULL,
    `record_date` DATETIME(3) NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Recorded',
    `created_by` VARCHAR(36) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `project_process_records_project_id_record_date_idx`(`project_id`, `record_date`),
    INDEX `project_process_records_record_type_status_idx`(`record_type`, `status`),
    INDEX `project_process_records_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_payments` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(36) NOT NULL,
    `payment_name` VARCHAR(200) NOT NULL,
    `payment_type` VARCHAR(30) NOT NULL DEFAULT 'Milestone',
    `due_date` DATETIME(3) NULL,
    `received_date` DATETIME(3) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'Planned',
    `original_amount` DECIMAL(18, 2) NOT NULL,
    `original_currency` VARCHAR(10) NOT NULL,
    `exchange_rate` DECIMAL(18, 8) NOT NULL,
    `converted_currency` VARCHAR(10) NOT NULL,
    `converted_amount` DECIMAL(18, 2) NOT NULL,
    `received_original_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `received_converted_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `rate_date` DATETIME(3) NOT NULL,
    `rate_source` VARCHAR(50) NOT NULL,
    `remark` VARCHAR(500) NULL,
    `created_by` VARCHAR(36) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `project_payments_project_id_status_idx`(`project_id`, `status`),
    INDEX `project_payments_due_date_idx`(`due_date`),
    INDEX `project_payments_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `archive_templates` (
    `id` VARCHAR(191) NOT NULL,
    `template_code` VARCHAR(50) NOT NULL,
    `template_name` VARCHAR(100) NOT NULL,
    `project_type` VARCHAR(50) NULL,
    `country_code` VARCHAR(10) NULL,
    `language_code` VARCHAR(10) NULL,
    `version` VARCHAR(10) NOT NULL DEFAULT 'V1.0',
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `description` TEXT NULL,
    `created_by` VARCHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `archive_templates_template_code_key`(`template_code`),
    INDEX `archive_templates_project_type_country_code_idx`(`project_type`, `country_code`),
    INDEX `archive_templates_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `archive_template_items` (
    `id` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(36) NOT NULL,
    `parent_id` VARCHAR(36) NULL,
    `stage_code` VARCHAR(30) NOT NULL,
    `item_no` INTEGER NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `name` VARCHAR(200) NOT NULL,
    `second_name` VARCHAR(200) NULL,
    `usage_description` TEXT NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT true,
    `is_star` BOOLEAN NOT NULL DEFAULT false,
    `is_sensitive` BOOLEAN NOT NULL DEFAULT false,
    `need_review` BOOLEAN NOT NULL DEFAULT false,
    `responsible_role` VARCHAR(50) NULL,
    `review_role` VARCHAR(50) NULL,
    `allowed_file_types` VARCHAR(200) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `archive_template_items_template_id_idx`(`template_id`),
    INDEX `archive_template_items_stage_code_idx`(`stage_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_archive_items` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(36) NOT NULL,
    `template_item_id` VARCHAR(36) NOT NULL,
    `parent_id` VARCHAR(36) NULL,
    `stage_code` VARCHAR(30) NOT NULL,
    `item_no` INTEGER NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `name` VARCHAR(200) NOT NULL,
    `second_name` VARCHAR(200) NULL,
    `usage_description` TEXT NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT true,
    `is_star` BOOLEAN NOT NULL DEFAULT false,
    `is_sensitive` BOOLEAN NOT NULL DEFAULT false,
    `need_review` BOOLEAN NOT NULL DEFAULT false,
    `responsible_user_id` VARCHAR(36) NULL,
    `review_user_id` VARCHAR(36) NULL,
    `status` ENUM('NotStarted', 'PendingUpload', 'Uploaded', 'Reviewing', 'Approved', 'Rejected', 'NotApplicable', 'Archived') NOT NULL DEFAULT 'NotStarted',
    `due_date` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `project_archive_items_project_id_idx`(`project_id`),
    INDEX `project_archive_items_stage_code_idx`(`stage_code`),
    INDEX `project_archive_items_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `files` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(36) NOT NULL,
    `archive_item_id` VARCHAR(36) NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `file_ext` VARCHAR(20) NOT NULL,
    `file_size` BIGINT NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `storage_provider` VARCHAR(20) NOT NULL DEFAULT 'minio',
    `storage_bucket` VARCHAR(100) NOT NULL DEFAULT 'delivery-platform',
    `storage_path` VARCHAR(500) NOT NULL,
    `version_no` VARCHAR(10) NOT NULL DEFAULT 'V1.0',
    `is_current` BOOLEAN NOT NULL DEFAULT true,
    `file_status` ENUM('Draft', 'Uploaded', 'Reviewing', 'Approved', 'Rejected', 'Deprecated', 'Archived') NOT NULL DEFAULT 'Uploaded',
    `upload_user_id` VARCHAR(36) NOT NULL,
    `upload_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `remark` TEXT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `files_project_id_idx`(`project_id`),
    INDEX `files_archive_item_id_idx`(`archive_item_id`),
    INDEX `files_file_status_idx`(`file_status`),
    INDEX `files_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_reviews` (
    `id` VARCHAR(191) NOT NULL,
    `file_id` VARCHAR(36) NOT NULL,
    `archive_item_id` VARCHAR(36) NOT NULL,
    `review_user_id` VARCHAR(36) NOT NULL,
    `review_status` VARCHAR(20) NOT NULL,
    `review_comment` TEXT NULL,
    `review_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `file_reviews_file_id_idx`(`file_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `checklist_templates` (
    `id` VARCHAR(191) NOT NULL,
    `template_code` VARCHAR(50) NOT NULL,
    `template_name` VARCHAR(100) NOT NULL,
    `country_code` VARCHAR(10) NULL,
    `project_type` VARCHAR(50) NULL,
    `stage_code` VARCHAR(30) NULL,
    `version` VARCHAR(10) NOT NULL DEFAULT 'V1.0',
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `checklist_templates_template_code_key`(`template_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `checklist_template_items` (
    `id` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(36) NOT NULL,
    `item_name` VARCHAR(200) NOT NULL,
    `item_description` TEXT NULL,
    `check_standard` TEXT NULL,
    `evidence_required` TEXT NULL,
    `related_archive_template_item_id` VARCHAR(36) NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT true,
    `risk_level` VARCHAR(20) NOT NULL DEFAULT 'Low',
    `responsible_role` VARCHAR(50) NULL,
    `review_role` VARCHAR(50) NULL,
    `evidence_types` VARCHAR(100) NOT NULL DEFAULT 'photo,file',
    `min_evidence_count` INTEGER NOT NULL DEFAULT 0,
    `allow_album` BOOLEAN NOT NULL DEFAULT true,
    `require_location` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `checklist_template_items_template_id_idx`(`template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_checklist_items` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(36) NOT NULL,
    `template_item_id` VARCHAR(36) NOT NULL,
    `related_archive_item_id` VARCHAR(36) NULL,
    `item_name` VARCHAR(200) NOT NULL,
    `check_standard` TEXT NULL,
    `evidence_required` TEXT NULL,
    `responsible_user_id` VARCHAR(36) NULL,
    `review_user_id` VARCHAR(36) NULL,
    `status` ENUM('Pending', 'Processing', 'Submitted', 'Reviewing', 'Approved', 'Rejected', 'Closed', 'NotApplicable') NOT NULL DEFAULT 'Pending',
    `due_date` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `result` VARCHAR(30) NULL,
    `result_note` TEXT NULL,
    `submitted_at` DATETIME(3) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `review_comment` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `project_checklist_items_project_id_idx`(`project_id`),
    INDEX `project_checklist_items_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_documents` (
    `id` VARCHAR(191) NOT NULL,
    `category_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `applicable_scope` TEXT NULL,
    `trigger_condition` TEXT NULL,
    `input_materials` TEXT NULL,
    `output_materials` TEXT NULL,
    `responsible_role` VARCHAR(50) NULL,
    `steps` TEXT NULL,
    `related_checklist` TEXT NULL,
    `related_templates` TEXT NULL,
    `related_archive` TEXT NULL,
    `risk_notes` TEXT NULL,
    `version` VARCHAR(10) NOT NULL DEFAULT 'V1.0',
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `workflow_documents_category_id_idx`(`category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_templates` (
    `id` VARCHAR(191) NOT NULL,
    `template_no` VARCHAR(50) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `category` VARCHAR(50) NOT NULL,
    `country_code` VARCHAR(10) NULL,
    `project_type` VARCHAR(50) NULL,
    `stage_code` VARCHAR(30) NULL,
    `applicable_role` VARCHAR(50) NULL,
    `language` VARCHAR(10) NOT NULL DEFAULT 'zh-CN',
    `file_format` VARCHAR(20) NULL,
    `storage_path` VARCHAR(500) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Draft',
    `author_id` VARCHAR(36) NULL,
    `reviewer_id` VARCHAR(36) NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `document_templates_template_no_key`(`template_no`),
    INDEX `document_templates_category_idx`(`category`),
    INDEX `document_templates_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_template_versions` (
    `id` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(36) NOT NULL,
    `version_no` VARCHAR(10) NOT NULL,
    `storage_path` VARCHAR(500) NOT NULL,
    `change_notes` TEXT NULL,
    `publisher_id` VARCHAR(36) NULL,
    `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `document_template_versions_template_id_idx`(`template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `parent_id` VARCHAR(36) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_articles` (
    `id` VARCHAR(191) NOT NULL,
    `category_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `country_code` VARCHAR(10) NULL,
    `project_type` VARCHAR(50) NULL,
    `stage_code` VARCHAR(30) NULL,
    `applicable_role` VARCHAR(50) NULL,
    `background` TEXT NULL,
    `standard_practice` TEXT NULL,
    `steps` TEXT NULL,
    `notes` TEXT NULL,
    `common_mistakes` TEXT NULL,
    `related_flow` VARCHAR(200) NULL,
    `related_checklist` VARCHAR(200) NULL,
    `related_template` VARCHAR(200) NULL,
    `content_type` VARCHAR(20) NOT NULL DEFAULT 'article',
    `file_url` VARCHAR(500) NULL,
    `file_size` BIGINT NULL,
    `file_ext` VARCHAR(20) NULL,
    `markdown_content` LONGTEXT NULL,
    `source_status` VARCHAR(20) NOT NULL DEFAULT 'Ready',
    `needs_revision` BOOLEAN NOT NULL DEFAULT false,
    `version` VARCHAR(10) NOT NULL DEFAULT 'V1.0',
    `status` ENUM('Draft', 'Reviewing', 'Published', 'Deprecated', 'Archived') NOT NULL DEFAULT 'Draft',
    `author_id` VARCHAR(36) NOT NULL,
    `reviewer_id` VARCHAR(36) NULL,
    `published_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_articles_category_id_idx`(`category_id`),
    INDEX `knowledge_articles_status_idx`(`status`),
    INDEX `knowledge_articles_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_article_versions` (
    `id` VARCHAR(191) NOT NULL,
    `article_id` VARCHAR(36) NOT NULL,
    `version` VARCHAR(10) NOT NULL,
    `markdown_content` LONGTEXT NULL,
    `change_notes` VARCHAR(500) NULL,
    `created_by` VARCHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `knowledge_article_versions_article_id_idx`(`article_id`),
    UNIQUE INDEX `knowledge_article_versions_article_id_version_key`(`article_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tool_categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tool_items` (
    `id` VARCHAR(191) NOT NULL,
    `category_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `tool_type` VARCHAR(20) NOT NULL DEFAULT 'internal',
    `url` VARCHAR(500) NULL,
    `icon` VARCHAR(100) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `tool_items_category_id_idx`(`category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `countries` (
    `id` VARCHAR(191) NOT NULL,
    `country_code` VARCHAR(10) NOT NULL,
    `name_zh` VARCHAR(50) NOT NULL,
    `name_en` VARCHAR(50) NOT NULL,
    `default_language` VARCHAR(10) NULL,
    `default_currency` VARCHAR(10) NULL,
    `timezone` VARCHAR(50) NULL,
    `weekend_rule` VARCHAR(20) NULL,
    `entry_requirements` TEXT NULL,
    `safety_notes` TEXT NULL,
    `tax_notes` TEXT NULL,
    `payment_notes` TEXT NULL,
    `supplier_notes` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `countries_country_code_key`(`country_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `currencies` (
    `id` VARCHAR(191) NOT NULL,
    `currency_code` VARCHAR(10) NOT NULL,
    `currency_name` VARCHAR(50) NOT NULL,
    `currency_symbol` VARCHAR(10) NULL,
    `decimal_places` INTEGER NOT NULL DEFAULT 2,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `currencies_currency_code_key`(`currency_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exchange_rates` (
    `id` VARCHAR(191) NOT NULL,
    `from_currency` VARCHAR(10) NOT NULL,
    `to_currency` VARCHAR(10) NOT NULL,
    `rate` DECIMAL(18, 8) NOT NULL,
    `rate_date` DATETIME(3) NOT NULL,
    `source` VARCHAR(50) NOT NULL DEFAULT 'manual',
    `is_locked` BOOLEAN NOT NULL DEFAULT false,
    `confirmed_by` VARCHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exchange_rates_from_currency_to_currency_idx`(`from_currency`, `to_currency`),
    UNIQUE INDEX `exchange_rates_from_currency_to_currency_rate_date_key`(`from_currency`, `to_currency`, `rate_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `languages` (
    `id` VARCHAR(191) NOT NULL,
    `language_code` VARCHAR(10) NOT NULL,
    `language_name` VARCHAR(50) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `languages_language_code_key`(`language_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `translations` (
    `id` VARCHAR(191) NOT NULL,
    `content_type` VARCHAR(50) NOT NULL,
    `content_id` VARCHAR(120) NOT NULL,
    `field_name` VARCHAR(100) NOT NULL,
    `language_code` VARCHAR(10) NOT NULL,
    `field_value` TEXT NOT NULL,
    `version` VARCHAR(10) NOT NULL DEFAULT 'V1.0',
    `review_status` VARCHAR(20) NOT NULL DEFAULT 'Draft',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `translations_content_type_content_id_idx`(`content_type`, `content_id`),
    UNIQUE INDEX `translations_content_type_content_id_field_name_language_cod_key`(`content_type`, `content_id`, `field_name`, `language_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` TEXT NOT NULL,
    `notification_type` VARCHAR(50) NOT NULL,
    `related_type` VARCHAR(50) NULL,
    `related_id` VARCHAR(36) NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `read_at` DATETIME(3) NULL,

    INDEX `notifications_user_id_is_read_idx`(`user_id`, `is_read`),
    INDEX `notifications_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_rules` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `event_type` VARCHAR(50) NOT NULL,
    `channel` VARCHAR(50) NOT NULL DEFAULT 'in_app',
    `recipient_role` VARCHAR(50) NULL,
    `template` TEXT NULL,
    `is_enabled` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `notification_rules_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operation_logs` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `module` VARCHAR(50) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `target_type` VARCHAR(50) NOT NULL,
    `target_id` VARCHAR(36) NOT NULL,
    `before_data` JSON NULL,
    `after_data` JSON NULL,
    `ip_address` VARCHAR(50) NULL,
    `user_agent` VARCHAR(500) NULL,
    `result` VARCHAR(20) NOT NULL DEFAULT 'success',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `operation_logs_user_id_idx`(`user_id`),
    INDEX `operation_logs_module_action_idx`(`module`, `action`),
    INDEX `operation_logs_target_type_target_id_idx`(`target_type`, `target_id`),
    INDEX `operation_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_configs` (
    `id` VARCHAR(191) NOT NULL,
    `config_key` VARCHAR(100) NOT NULL,
    `config_value` TEXT NOT NULL,
    `description` VARCHAR(200) NULL,
    `config_type` VARCHAR(20) NOT NULL DEFAULT 'string',
    `updated_by` VARCHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `system_configs_config_key_key`(`config_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dashboard_widgets` (
    `id` VARCHAR(191) NOT NULL,
    `widget_key` VARCHAR(50) NOT NULL,
    `widget_name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(200) NULL,
    `default_role` VARCHAR(50) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dashboard_widgets_widget_key_key`(`widget_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `integration_configs` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(50) NOT NULL,
    `config_name` VARCHAR(100) NOT NULL,
    `config_value` JSON NOT NULL,
    `is_enabled` BOOLEAN NOT NULL DEFAULT false,
    `description` VARCHAR(200) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_keys` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `api_key` VARCHAR(255) NOT NULL,
    `permissions` JSON NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `last_used_at` DATETIME(3) NULL,
    `is_enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `api_keys_api_key_key`(`api_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_reports` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(36) NOT NULL,
    `author_id` VARCHAR(36) NOT NULL,
    `report_type` VARCHAR(20) NOT NULL,
    `report_date` DATETIME(3) NOT NULL,
    `content` TEXT NOT NULL,
    `work_hours` DECIMAL(5, 1) NULL,
    `project_progress` VARCHAR(500) NULL,
    `payment_progress` VARCHAR(500) NULL,
    `risk_notes` TEXT NULL,
    `next_plan` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Draft',
    `reviewed_by` VARCHAR(36) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `daily_reports_project_id_report_type_idx`(`project_id`, `report_type`),
    INDEX `daily_reports_author_id_report_date_idx`(`author_id`, `report_date`),
    INDEX `daily_reports_report_date_idx`(`report_date`),
    INDEX `daily_reports_deleted_at_idx`(`deleted_at`),
    INDEX `daily_reports_project_id_report_date_status_idx`(`project_id`, `report_date`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `okr_objectives` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `period` VARCHAR(20) NOT NULL,
    `period_type` VARCHAR(20) NOT NULL,
    `owner_id` VARCHAR(36) NOT NULL,
    `department_id` VARCHAR(36) NULL,
    `weight` INTEGER NOT NULL DEFAULT 100,
    `progress` INTEGER NOT NULL DEFAULT 0,
    `goal_type` VARCHAR(20) NOT NULL DEFAULT 'OKR',
    `scoring_flow` VARCHAR(30) NOT NULL DEFAULT 'Manager',
    `scoring_method` VARCHAR(30) NOT NULL DEFAULT 'Weighted',
    `scorer_ids` JSON NULL,
    `scoring_content` JSON NULL,
    `calculation_rule` VARCHAR(500) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `okr_objectives_owner_id_period_idx`(`owner_id`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `key_results` (
    `id` VARCHAR(191) NOT NULL,
    `objective_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `target_value` VARCHAR(100) NULL,
    `current_value` VARCHAR(100) NULL,
    `weight` INTEGER NOT NULL DEFAULT 100,
    `progress` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `performance_scores` (
    `id` VARCHAR(191) NOT NULL,
    `objective_id` VARCHAR(36) NOT NULL,
    `scorer_id` VARCHAR(36) NOT NULL,
    `month` VARCHAR(7) NOT NULL,
    `self_score` INTEGER NULL,
    `manager_score` INTEGER NULL,
    `project_ratio` TEXT NULL,
    `comment` TEXT NULL,
    `next_goal` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Draft',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `performance_scores_objective_id_month_scorer_id_key`(`objective_id`, `month`, `scorer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attachments` (
    `id` VARCHAR(191) NOT NULL,
    `owner_type` VARCHAR(50) NOT NULL,
    `owner_id` VARCHAR(36) NOT NULL,
    `project_id` VARCHAR(36) NULL,
    `category` VARCHAR(30) NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `file_ext` VARCHAR(20) NOT NULL,
    `file_size` BIGINT NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `storage_bucket` VARCHAR(100) NOT NULL,
    `storage_path` VARCHAR(500) NOT NULL,
    `uploaded_by` VARCHAR(36) NOT NULL,
    `captured_at` DATETIME(3) NULL,
    `capture_source` VARCHAR(20) NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `remark` VARCHAR(500) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attachments_owner_type_owner_id_idx`(`owner_type`, `owner_id`),
    INDEX `attachments_project_id_idx`(`project_id`),
    INDEX `attachments_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dictionary_categories` (
    `id` VARCHAR(191) NOT NULL,
    `category_code` VARCHAR(50) NOT NULL,
    `category_name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(300) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dictionary_categories_category_code_key`(`category_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dictionary_items` (
    `id` VARCHAR(191) NOT NULL,
    `category_id` VARCHAR(36) NOT NULL,
    `item_value` VARCHAR(100) NOT NULL,
    `item_label` VARCHAR(100) NOT NULL,
    `extra_data` JSON NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `dictionary_items_category_id_status_idx`(`category_id`, `status`),
    UNIQUE INDEX `dictionary_items_category_id_item_value_key`(`category_id`, `item_value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `departments` (
    `id` VARCHAR(191) NOT NULL,
    `department_code` VARCHAR(50) NOT NULL,
    `department_name` VARCHAR(100) NOT NULL,
    `parent_id` VARCHAR(36) NULL,
    `manager_id` VARCHAR(36) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `departments_department_code_key`(`department_code`),
    INDEX `departments_parent_id_idx`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `approval_templates` (
    `id` VARCHAR(191) NOT NULL,
    `template_code` VARCHAR(50) NOT NULL,
    `template_name` VARCHAR(100) NOT NULL,
    `business_type` VARCHAR(50) NOT NULL,
    `country_code` VARCHAR(10) NULL,
    `is_enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `approval_templates_template_code_key`(`template_code`),
    INDEX `approval_templates_business_type_is_enabled_idx`(`business_type`, `is_enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `approval_steps` (
    `id` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(36) NOT NULL,
    `step_order` INTEGER NOT NULL,
    `step_name` VARCHAR(100) NOT NULL,
    `approver_type` VARCHAR(30) NOT NULL,
    `approver_value` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `approval_steps_template_id_step_order_key`(`template_id`, `step_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `approval_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(36) NOT NULL,
    `business_type` VARCHAR(50) NOT NULL,
    `business_id` VARCHAR(36) NOT NULL,
    `business_title` VARCHAR(200) NULL,
    `applicant_id` VARCHAR(36) NOT NULL,
    `current_step` INTEGER NOT NULL DEFAULT 1,
    `approver_id` VARCHAR(36) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Pending',
    `comment` VARCHAR(500) NULL,
    `decided_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `approval_tasks_business_type_business_id_idx`(`business_type`, `business_id`),
    INDEX `approval_tasks_approver_id_status_idx`(`approver_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `approval_actions` (
    `id` VARCHAR(191) NOT NULL,
    `task_id` VARCHAR(36) NOT NULL,
    `step_order` INTEGER NOT NULL,
    `action` VARCHAR(30) NOT NULL,
    `actor_id` VARCHAR(36) NOT NULL,
    `comment` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `approval_actions_task_id_created_at_idx`(`task_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skill_definitions` (
    `id` VARCHAR(191) NOT NULL,
    `skill_code` VARCHAR(50) NOT NULL,
    `skill_name` VARCHAR(100) NOT NULL,
    `category` VARCHAR(50) NOT NULL,
    `description` VARCHAR(500) NULL,
    `max_level` INTEGER NOT NULL DEFAULT 5,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `skill_definitions_skill_code_key`(`skill_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skill_assessments` (
    `id` VARCHAR(191) NOT NULL,
    `skill_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `assessor_id` VARCHAR(36) NOT NULL,
    `level` INTEGER NOT NULL,
    `self_score` INTEGER NULL,
    `manager_score` INTEGER NULL,
    `final_score` INTEGER NULL,
    `period` VARCHAR(20) NOT NULL,
    `evidence_note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `skill_assessments_user_id_period_idx`(`user_id`, `period`),
    UNIQUE INDEX `skill_assessments_skill_id_user_id_period_key`(`skill_id`, `user_id`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `training_plans` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `category` VARCHAR(50) NOT NULL,
    `trainer_name` VARCHAR(100) NULL,
    `trainer_id` VARCHAR(36) NULL,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NULL,
    `location` VARCHAR(200) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Planned',
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `training_plans_start_at_status_idx`(`start_at`, `status`),
    INDEX `training_plans_trainer_id_idx`(`trainer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `training_participants` (
    `id` VARCHAR(191) NOT NULL,
    `training_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `attendance` VARCHAR(20) NOT NULL DEFAULT 'Invited',
    `signed_at` DATETIME(3) NULL,
    `score` INTEGER NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `training_participants_training_id_user_id_key`(`training_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_retrospectives` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(36) NOT NULL,
    `summary` TEXT NOT NULL,
    `lessons_learned` TEXT NULL,
    `problem_category` VARCHAR(50) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Draft',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `project_retrospectives_project_id_status_idx`(`project_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `retrospective_actions` (
    `id` VARCHAR(191) NOT NULL,
    `retrospective_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `owner_id` VARCHAR(36) NOT NULL,
    `due_date` DATETIME(3) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Open',
    `verification_note` VARCHAR(500) NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `retrospective_actions_owner_id_status_idx`(`owner_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `backup_records` (
    `id` VARCHAR(191) NOT NULL,
    `backup_type` VARCHAR(30) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Pending',
    `storage_path` VARCHAR(500) NULL,
    `file_size` BIGINT NULL,
    `requested_by` VARCHAR(36) NOT NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `error_message` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `backup_records_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_process_records` ADD CONSTRAINT `project_process_records_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_process_records` ADD CONSTRAINT `project_process_records_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_payments` ADD CONSTRAINT `project_payments_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_payments` ADD CONSTRAINT `project_payments_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archive_template_items` ADD CONSTRAINT `archive_template_items_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `archive_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archive_template_items` ADD CONSTRAINT `archive_template_items_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `archive_template_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_archive_items` ADD CONSTRAINT `project_archive_items_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_archive_items` ADD CONSTRAINT `project_archive_items_template_item_id_fkey` FOREIGN KEY (`template_item_id`) REFERENCES `archive_template_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_archive_items` ADD CONSTRAINT `project_archive_items_responsible_user_id_fkey` FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_archive_items` ADD CONSTRAINT `project_archive_items_review_user_id_fkey` FOREIGN KEY (`review_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_archive_items` ADD CONSTRAINT `project_archive_items_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `project_archive_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `files` ADD CONSTRAINT `files_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `files` ADD CONSTRAINT `files_archive_item_id_fkey` FOREIGN KEY (`archive_item_id`) REFERENCES `project_archive_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `files` ADD CONSTRAINT `files_upload_user_id_fkey` FOREIGN KEY (`upload_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_reviews` ADD CONSTRAINT `file_reviews_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_reviews` ADD CONSTRAINT `file_reviews_review_user_id_fkey` FOREIGN KEY (`review_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `checklist_template_items` ADD CONSTRAINT `checklist_template_items_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `checklist_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_checklist_items` ADD CONSTRAINT `project_checklist_items_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_checklist_items` ADD CONSTRAINT `project_checklist_items_template_item_id_fkey` FOREIGN KEY (`template_item_id`) REFERENCES `checklist_template_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_checklist_items` ADD CONSTRAINT `project_checklist_items_responsible_user_id_fkey` FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_checklist_items` ADD CONSTRAINT `project_checklist_items_review_user_id_fkey` FOREIGN KEY (`review_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_documents` ADD CONSTRAINT `workflow_documents_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `workflow_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_template_versions` ADD CONSTRAINT `document_template_versions_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `document_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_categories` ADD CONSTRAINT `knowledge_categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `knowledge_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_articles` ADD CONSTRAINT `knowledge_articles_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `knowledge_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_articles` ADD CONSTRAINT `knowledge_articles_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_articles` ADD CONSTRAINT `knowledge_articles_reviewer_id_fkey` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_article_versions` ADD CONSTRAINT `knowledge_article_versions_article_id_fkey` FOREIGN KEY (`article_id`) REFERENCES `knowledge_articles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_article_versions` ADD CONSTRAINT `knowledge_article_versions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tool_items` ADD CONSTRAINT `tool_items_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `tool_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exchange_rates` ADD CONSTRAINT `exchange_rates_from_currency_fkey` FOREIGN KEY (`from_currency`) REFERENCES `currencies`(`currency_code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exchange_rates` ADD CONSTRAINT `exchange_rates_to_currency_fkey` FOREIGN KEY (`to_currency`) REFERENCES `currencies`(`currency_code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_reports` ADD CONSTRAINT `daily_reports_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_reports` ADD CONSTRAINT `daily_reports_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_reports` ADD CONSTRAINT `daily_reports_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `okr_objectives` ADD CONSTRAINT `okr_objectives_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `key_results` ADD CONSTRAINT `key_results_objective_id_fkey` FOREIGN KEY (`objective_id`) REFERENCES `okr_objectives`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `performance_scores` ADD CONSTRAINT `performance_scores_objective_id_fkey` FOREIGN KEY (`objective_id`) REFERENCES `okr_objectives`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `performance_scores` ADD CONSTRAINT `performance_scores_scorer_id_fkey` FOREIGN KEY (`scorer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dictionary_items` ADD CONSTRAINT `dictionary_items_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `dictionary_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_manager_id_fkey` FOREIGN KEY (`manager_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approval_steps` ADD CONSTRAINT `approval_steps_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `approval_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approval_tasks` ADD CONSTRAINT `approval_tasks_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `approval_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approval_tasks` ADD CONSTRAINT `approval_tasks_applicant_id_fkey` FOREIGN KEY (`applicant_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approval_tasks` ADD CONSTRAINT `approval_tasks_approver_id_fkey` FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approval_actions` ADD CONSTRAINT `approval_actions_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `approval_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approval_actions` ADD CONSTRAINT `approval_actions_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_assessments` ADD CONSTRAINT `skill_assessments_skill_id_fkey` FOREIGN KEY (`skill_id`) REFERENCES `skill_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_assessments` ADD CONSTRAINT `skill_assessments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_assessments` ADD CONSTRAINT `skill_assessments_assessor_id_fkey` FOREIGN KEY (`assessor_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `training_plans` ADD CONSTRAINT `training_plans_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `training_participants` ADD CONSTRAINT `training_participants_training_id_fkey` FOREIGN KEY (`training_id`) REFERENCES `training_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `training_participants` ADD CONSTRAINT `training_participants_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_retrospectives` ADD CONSTRAINT `project_retrospectives_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `retrospective_actions` ADD CONSTRAINT `retrospective_actions_retrospective_id_fkey` FOREIGN KEY (`retrospective_id`) REFERENCES `project_retrospectives`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `retrospective_actions` ADD CONSTRAINT `retrospective_actions_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `backup_records` ADD CONSTRAINT `backup_records_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
