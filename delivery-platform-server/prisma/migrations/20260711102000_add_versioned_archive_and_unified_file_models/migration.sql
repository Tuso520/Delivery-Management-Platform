-- Phase 3/4 additive target models. Legacy archive/file tables are intentionally
-- left untouched. Existing rows are inspected by the dry-run migration audit
-- before any later backfill or constraint tightening migration is applied.

ALTER TABLE `archive_templates`
  ADD COLUMN `updated_by` VARCHAR(36) NULL,
  ADD COLUMN `current_published_version_id` VARCHAR(36) NULL,
  ADD UNIQUE INDEX `archive_templates_current_published_version_id_key`
    (`current_published_version_id`);

ALTER TABLE `projects`
  ADD COLUMN `archive_template_id` VARCHAR(36) NULL,
  ADD COLUMN `archive_template_version_id` VARCHAR(36) NULL,
  ADD INDEX `projects_archive_template_id_idx` (`archive_template_id`),
  ADD INDEX `projects_archive_template_version_id_idx`
    (`archive_template_version_id`);

CREATE TABLE `archive_template_versions` (
  `id` VARCHAR(36) NOT NULL,
  `template_id` VARCHAR(36) NOT NULL,
  `version_no` VARCHAR(20) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  `source_version_id` VARCHAR(36) NULL,
  `submitted_at` DATETIME(3) NULL,
  `published_at` DATETIME(3) NULL,
  `published_by` VARCHAR(36) NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `archive_template_versions_template_id_version_no_key`
    (`template_id`, `version_no`),
  INDEX `archive_template_versions_template_id_status_idx`
    (`template_id`, `status`),
  INDEX `archive_template_versions_source_version_id_idx`
    (`source_version_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `archive_template_folders` (
  `id` VARCHAR(36) NOT NULL,
  `template_version_id` VARCHAR(36) NOT NULL,
  `stable_key` VARCHAR(100) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `archive_template_folders_template_version_id_stable_key_key`
    (`template_version_id`, `stable_key`),
  INDEX `archive_template_folders_template_version_id_sort_order_idx`
    (`template_version_id`, `sort_order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `archive_template_version_items` (
  `id` VARCHAR(36) NOT NULL,
  `template_version_id` VARCHAR(36) NOT NULL,
  `folder_id` VARCHAR(36) NOT NULL,
  `stable_key` VARCHAR(100) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `required` BOOLEAN NOT NULL DEFAULT true,
  `review_required` BOOLEAN NOT NULL DEFAULT false,
  `approval_template_id` VARCHAR(36) NULL,
  `owner_role_id` VARCHAR(36) NULL,
  `allow_multiple_files` BOOLEAN NOT NULL DEFAULT false,
  `allowed_extensions` JSON NULL,
  `max_file_size` BIGINT NULL,
  `naming_rule` VARCHAR(500) NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `atv_items_version_stable_key_uq`
    (`template_version_id`, `stable_key`),
  INDEX `archive_template_version_items_template_version_id_idx`
    (`template_version_id`),
  INDEX `archive_template_version_items_folder_id_sort_order_idx`
    (`folder_id`, `sort_order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_archive_folders` (
  `id` VARCHAR(36) NOT NULL,
  `project_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `source_template_folder_id` VARCHAR(36) NULL,
  `source_stable_key` VARCHAR(100) NULL,
  `is_temporary` BOOLEAN NOT NULL DEFAULT false,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `project_archive_folders_project_id_source_stable_key_key`
    (`project_id`, `source_stable_key`),
  INDEX `project_archive_folders_project_id_sort_order_idx`
    (`project_id`, `sort_order`),
  INDEX `project_archive_folders_archived_at_idx` (`archived_at`),
  INDEX `project_archive_folders_source_template_folder_id_idx`
    (`source_template_folder_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_archive_entries` (
  `id` VARCHAR(36) NOT NULL,
  `project_id` VARCHAR(36) NOT NULL,
  `folder_id` VARCHAR(36) NOT NULL,
  `template_version_id` VARCHAR(36) NULL,
  `source_template_item_id` VARCHAR(36) NULL,
  `source_stable_key` VARCHAR(100) NULL,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `required` BOOLEAN NOT NULL DEFAULT true,
  `review_required` BOOLEAN NOT NULL DEFAULT false,
  `approval_template_id` VARCHAR(36) NULL,
  `owner_user_id` VARCHAR(36) NULL,
  `owner_role_id` VARCHAR(36) NULL,
  `allow_multiple_files` BOOLEAN NOT NULL DEFAULT false,
  `allowed_extensions` JSON NULL,
  `max_file_size` BIGINT NULL,
  `naming_rule` VARCHAR(500) NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `is_temporary` BOOLEAN NOT NULL DEFAULT false,
  `temporary_reason` VARCHAR(500) NULL,
  `suggested_for_template` BOOLEAN NOT NULL DEFAULT false,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `project_archive_entries_project_version_stable_uq`
    (`project_id`, `template_version_id`, `source_stable_key`),
  INDEX `project_archive_entries_project_id_folder_id_sort_order_idx`
    (`project_id`, `folder_id`, `sort_order`),
  INDEX `project_archive_entries_owner_user_id_idx` (`owner_user_id`),
  INDEX `project_archive_entries_archived_at_idx` (`archived_at`),
  INDEX `project_archive_entries_template_version_id_idx`
    (`template_version_id`),
  INDEX `project_archive_entries_source_template_item_id_idx`
    (`source_template_item_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `logical_files` (
  `id` VARCHAR(36) NOT NULL,
  `owner_type` VARCHAR(50) NOT NULL,
  `owner_id` VARCHAR(36) NOT NULL,
  `display_name` VARCHAR(255) NOT NULL,
  `current_version_id` VARCHAR(36) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  `created_by` VARCHAR(36) NOT NULL,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `logical_files_current_version_id_key` (`current_version_id`),
  INDEX `logical_files_owner_type_owner_id_idx` (`owner_type`, `owner_id`),
  INDEX `logical_files_status_idx` (`status`),
  INDEX `logical_files_archived_at_idx` (`archived_at`),
  INDEX `logical_files_created_by_idx` (`created_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `file_assets` (
  `id` VARCHAR(36) NOT NULL,
  `owner_type` VARCHAR(50) NOT NULL,
  `owner_id` VARCHAR(36) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `extension` VARCHAR(20) NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `size` BIGINT NOT NULL,
  `storage_provider` VARCHAR(20) NOT NULL DEFAULT 'minio',
  `storage_bucket` VARCHAR(100) NOT NULL,
  `storage_key` VARCHAR(500) NOT NULL,
  `checksum` VARCHAR(128) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
  `created_by` VARCHAR(36) NOT NULL,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `file_assets_storage_bucket_storage_key_key`
    (`storage_bucket`, `storage_key`),
  INDEX `file_assets_owner_type_owner_id_idx` (`owner_type`, `owner_id`),
  INDEX `file_assets_status_idx` (`status`),
  INDEX `file_assets_archived_at_idx` (`archived_at`),
  INDEX `file_assets_created_by_idx` (`created_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `file_versions` (
  `id` VARCHAR(36) NOT NULL,
  `logical_file_id` VARCHAR(36) NOT NULL,
  `version` VARCHAR(20) NOT NULL,
  `version_sequence` INTEGER NOT NULL,
  `revision_level` VARCHAR(20) NOT NULL DEFAULT 'MINOR',
  `asset_id` VARCHAR(36) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'UPLOADED',
  `change_description` VARCHAR(1000) NULL,
  `uploaded_by` VARCHAR(36) NOT NULL,
  `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `approved_at` DATETIME(3) NULL,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `file_versions_logical_file_id_version_sequence_key`
    (`logical_file_id`, `version_sequence`),
  UNIQUE INDEX `file_versions_logical_file_id_version_key`
    (`logical_file_id`, `version`),
  INDEX `file_versions_asset_id_idx` (`asset_id`),
  INDEX `file_versions_status_idx` (`status`),
  INDEX `file_versions_uploaded_by_idx` (`uploaded_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `file_processing_jobs` (
  `id` VARCHAR(36) NOT NULL,
  `file_asset_id` VARCHAR(36) NOT NULL,
  `type` VARCHAR(30) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `progress` INTEGER NOT NULL DEFAULT 0,
  `output_asset_id` VARCHAR(36) NULL,
  `error_code` VARCHAR(100) NULL,
  `error_message` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `file_processing_jobs_file_asset_id_type_status_idx`
    (`file_asset_id`, `type`, `status`),
  INDEX `file_processing_jobs_status_created_at_idx` (`status`, `created_at`),
  INDEX `file_processing_jobs_output_asset_id_idx` (`output_asset_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_archive_files` (
  `id` VARCHAR(36) NOT NULL,
  `project_id` VARCHAR(36) NOT NULL,
  `archive_item_id` VARCHAR(36) NOT NULL,
  `logical_file_id` VARCHAR(36) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  `created_by` VARCHAR(36) NOT NULL,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `project_archive_files_logical_file_id_key` (`logical_file_id`),
  INDEX `project_archive_files_project_id_archive_item_id_idx`
    (`project_id`, `archive_item_id`),
  INDEX `project_archive_files_status_idx` (`status`),
  INDEX `project_archive_files_archived_at_idx` (`archived_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `migration_exceptions` (
  `id` VARCHAR(36) NOT NULL,
  `domain` VARCHAR(50) NOT NULL,
  `entity_type` VARCHAR(50) NOT NULL,
  `entity_id` VARCHAR(100) NOT NULL,
  `code` VARCHAR(100) NOT NULL,
  `details` JSON NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  `resolved_by` VARCHAR(36) NULL,
  `resolved_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `migration_exceptions_domain_entity_type_entity_id_code_key`
    (`domain`, `entity_type`, `entity_id`, `code`),
  INDEX `migration_exceptions_domain_status_idx` (`domain`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `archive_template_versions`
  ADD CONSTRAINT `archive_template_versions_template_id_fkey`
    FOREIGN KEY (`template_id`) REFERENCES `archive_templates`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `archive_template_versions_source_version_id_fkey`
    FOREIGN KEY (`source_version_id`) REFERENCES `archive_template_versions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `archive_templates`
  ADD CONSTRAINT `archive_templates_current_published_version_id_fkey`
    FOREIGN KEY (`current_published_version_id`)
    REFERENCES `archive_template_versions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `archive_template_folders`
  ADD CONSTRAINT `archive_template_folders_template_version_id_fkey`
    FOREIGN KEY (`template_version_id`) REFERENCES `archive_template_versions`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `archive_template_version_items`
  ADD CONSTRAINT `archive_template_version_items_template_version_id_fkey`
    FOREIGN KEY (`template_version_id`) REFERENCES `archive_template_versions`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `archive_template_version_items_folder_id_fkey`
    FOREIGN KEY (`folder_id`) REFERENCES `archive_template_folders`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_archive_folders`
  ADD CONSTRAINT `project_archive_folders_project_id_fkey`
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `project_archive_folders_source_template_folder_id_fkey`
    FOREIGN KEY (`source_template_folder_id`) REFERENCES `archive_template_folders`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `project_archive_entries`
  ADD CONSTRAINT `project_archive_entries_project_id_fkey`
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `project_archive_entries_folder_id_fkey`
    FOREIGN KEY (`folder_id`) REFERENCES `project_archive_folders`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `project_archive_entries_template_version_id_fkey`
    FOREIGN KEY (`template_version_id`) REFERENCES `archive_template_versions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `project_archive_entries_source_template_item_id_fkey`
    FOREIGN KEY (`source_template_item_id`)
    REFERENCES `archive_template_version_items`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `project_archive_entries_owner_user_id_fkey`
    FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `logical_files`
  ADD CONSTRAINT `logical_files_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `file_assets`
  ADD CONSTRAINT `file_assets_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `file_versions`
  ADD CONSTRAINT `file_versions_logical_file_id_fkey`
    FOREIGN KEY (`logical_file_id`) REFERENCES `logical_files`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `file_versions_asset_id_fkey`
    FOREIGN KEY (`asset_id`) REFERENCES `file_assets`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `file_versions_uploaded_by_fkey`
    FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `logical_files`
  ADD CONSTRAINT `logical_files_current_version_id_fkey`
    FOREIGN KEY (`current_version_id`) REFERENCES `file_versions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `file_processing_jobs`
  ADD CONSTRAINT `file_processing_jobs_file_asset_id_fkey`
    FOREIGN KEY (`file_asset_id`) REFERENCES `file_assets`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `file_processing_jobs_output_asset_id_fkey`
    FOREIGN KEY (`output_asset_id`) REFERENCES `file_assets`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `project_archive_files`
  ADD CONSTRAINT `project_archive_files_project_id_fkey`
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `project_archive_files_archive_item_id_fkey`
    FOREIGN KEY (`archive_item_id`) REFERENCES `project_archive_entries`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `project_archive_files_logical_file_id_fkey`
    FOREIGN KEY (`logical_file_id`) REFERENCES `logical_files`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `projects`
  ADD CONSTRAINT `projects_archive_template_id_fkey`
    FOREIGN KEY (`archive_template_id`) REFERENCES `archive_templates`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `projects_archive_template_version_id_fkey`
    FOREIGN KEY (`archive_template_version_id`)
    REFERENCES `archive_template_versions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
