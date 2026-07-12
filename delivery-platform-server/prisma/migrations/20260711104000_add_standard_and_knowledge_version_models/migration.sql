-- Additive target standard/knowledge libraries. Legacy workflow, checklist,
-- document-template, knowledge-article and attachment tables are preserved.

CREATE TABLE `standards` (
  `id` VARCHAR(36) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `category` VARCHAR(100) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  `current_published_version_id` VARCHAR(36) NULL,
  `effective_at` DATETIME(3) NULL,
  `created_by` VARCHAR(36) NOT NULL,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `standards_code_key` (`code`),
  UNIQUE INDEX `standards_current_published_version_id_key`
    (`current_published_version_id`),
  INDEX `standards_type_status_idx` (`type`, `status`),
  INDEX `standards_category_idx` (`category`),
  INDEX `standards_archived_at_idx` (`archived_at`),
  INDEX `standards_created_by_idx` (`created_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `standard_versions` (
  `id` VARCHAR(36) NOT NULL,
  `standard_id` VARCHAR(36) NOT NULL,
  `version` VARCHAR(20) NOT NULL,
  `file_version_id` VARCHAR(36) NULL,
  `structured_content` JSON NULL,
  `applicability` JSON NULL,
  `legacy_snapshot` JSON NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  `effective_at` DATETIME(3) NULL,
  `change_description` VARCHAR(1000) NULL,
  `submitted_by` VARCHAR(36) NOT NULL,
  `submitted_at` DATETIME(3) NULL,
  `published_at` DATETIME(3) NULL,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `standard_versions_standard_id_version_key`
    (`standard_id`, `version`),
  INDEX `standard_versions_standard_id_status_idx` (`standard_id`, `status`),
  INDEX `standard_versions_file_version_id_idx` (`file_version_id`),
  INDEX `standard_versions_submitted_by_idx` (`submitted_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `standard_relations` (
  `id` VARCHAR(36) NOT NULL,
  `source_standard_id` VARCHAR(36) NOT NULL,
  `target_standard_id` VARCHAR(36) NOT NULL,
  `relation_type` VARCHAR(30) NOT NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `standard_relations_source_target_type_uq`
    (`source_standard_id`, `target_standard_id`, `relation_type`),
  INDEX `standard_relations_target_standard_id_idx` (`target_standard_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_items` (
  `id` VARCHAR(36) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `category_id` VARCHAR(36) NOT NULL,
  `summary` VARCHAR(1000) NULL,
  `content_type` VARCHAR(20) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  `current_published_version_id` VARCHAR(36) NULL,
  `effective_at` DATETIME(3) NULL,
  `created_by` VARCHAR(36) NOT NULL,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `knowledge_items_current_published_version_id_key`
    (`current_published_version_id`),
  INDEX `knowledge_items_category_id_status_idx` (`category_id`, `status`),
  INDEX `knowledge_items_content_type_idx` (`content_type`),
  INDEX `knowledge_items_archived_at_idx` (`archived_at`),
  INDEX `knowledge_items_created_by_idx` (`created_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_versions_v2` (
  `id` VARCHAR(36) NOT NULL,
  `knowledge_item_id` VARCHAR(36) NOT NULL,
  `version` VARCHAR(20) NOT NULL,
  `content_type` VARCHAR(20) NOT NULL,
  `file_version_id` VARCHAR(36) NULL,
  `markdown_content` LONGTEXT NULL,
  `external_url` VARCHAR(2000) NULL,
  `legacy_snapshot` JSON NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  `change_description` VARCHAR(1000) NULL,
  `submitted_by` VARCHAR(36) NOT NULL,
  `submitted_at` DATETIME(3) NULL,
  `published_at` DATETIME(3) NULL,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `knowledge_versions_v2_knowledge_item_id_version_key`
    (`knowledge_item_id`, `version`),
  INDEX `knowledge_versions_v2_knowledge_item_id_status_idx`
    (`knowledge_item_id`, `status`),
  INDEX `knowledge_versions_v2_file_version_id_idx` (`file_version_id`),
  INDEX `knowledge_versions_v2_submitted_by_idx` (`submitted_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_version_files` (
  `id` VARCHAR(36) NOT NULL,
  `knowledge_version_id` VARCHAR(36) NOT NULL,
  `file_version_id` VARCHAR(36) NOT NULL,
  `role` VARCHAR(20) NOT NULL DEFAULT 'SUPPORTING',
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `knowledge_version_files_knowledge_version_id_file_version_id_key`
    (`knowledge_version_id`, `file_version_id`),
  INDEX `knowledge_version_files_file_version_id_idx` (`file_version_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `standards`
  ADD CONSTRAINT `standards_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `standard_versions`
  ADD CONSTRAINT `standard_versions_standard_id_fkey`
    FOREIGN KEY (`standard_id`) REFERENCES `standards`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `standard_versions_file_version_id_fkey`
    FOREIGN KEY (`file_version_id`) REFERENCES `file_versions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `standard_versions_submitted_by_fkey`
    FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `standards`
  ADD CONSTRAINT `standards_current_published_version_id_fkey`
    FOREIGN KEY (`current_published_version_id`) REFERENCES `standard_versions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `standard_relations`
  ADD CONSTRAINT `standard_relations_source_standard_id_fkey`
    FOREIGN KEY (`source_standard_id`) REFERENCES `standards`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `standard_relations_target_standard_id_fkey`
    FOREIGN KEY (`target_standard_id`) REFERENCES `standards`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `knowledge_items`
  ADD CONSTRAINT `knowledge_items_category_id_fkey`
    FOREIGN KEY (`category_id`) REFERENCES `knowledge_categories`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `knowledge_items_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `knowledge_versions_v2`
  ADD CONSTRAINT `knowledge_versions_v2_knowledge_item_id_fkey`
    FOREIGN KEY (`knowledge_item_id`) REFERENCES `knowledge_items`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `knowledge_versions_v2_file_version_id_fkey`
    FOREIGN KEY (`file_version_id`) REFERENCES `file_versions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `knowledge_versions_v2_submitted_by_fkey`
    FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `knowledge_items`
  ADD CONSTRAINT `knowledge_items_current_published_version_id_fkey`
    FOREIGN KEY (`current_published_version_id`) REFERENCES `knowledge_versions_v2`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `knowledge_version_files`
  ADD CONSTRAINT `knowledge_version_files_knowledge_version_id_fkey`
    FOREIGN KEY (`knowledge_version_id`) REFERENCES `knowledge_versions_v2`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `knowledge_version_files_file_version_id_fkey`
    FOREIGN KEY (`file_version_id`) REFERENCES `file_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
