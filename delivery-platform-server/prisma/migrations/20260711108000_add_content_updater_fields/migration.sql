-- Add explicit updater ownership for target Standard and Knowledge list/audit views.
-- Existing rows are deterministically backfilled from their original creator.

ALTER TABLE `standards`
  ADD COLUMN `updated_by` VARCHAR(36) NULL AFTER `created_by`;

UPDATE `standards`
SET `updated_by` = `created_by`
WHERE `updated_by` IS NULL;

ALTER TABLE `standards`
  MODIFY COLUMN `updated_by` VARCHAR(36) NOT NULL,
  ADD INDEX `standards_updated_by_idx` (`updated_by`),
  ADD CONSTRAINT `standards_updated_by_fkey`
    FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `knowledge_items`
  ADD COLUMN `updated_by` VARCHAR(36) NULL AFTER `created_by`;

UPDATE `knowledge_items`
SET `updated_by` = `created_by`
WHERE `updated_by` IS NULL;

ALTER TABLE `knowledge_items`
  MODIFY COLUMN `updated_by` VARCHAR(36) NOT NULL,
  ADD INDEX `knowledge_items_updated_by_idx` (`updated_by`),
  ADD CONSTRAINT `knowledge_items_updated_by_fkey`
    FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Archive template already stores creator/updater IDs; make those references
-- queryable and protected without changing existing values.
INSERT INTO `migration_exceptions`
  (`id`, `domain`, `entity_type`, `entity_id`, `code`, `details`, `status`, `created_at`, `updated_at`)
SELECT
  UUID(), 'ARCHIVE_TEMPLATE', 'ArchiveTemplate', t.`id`, 'ORPHAN_CREATOR',
  JSON_OBJECT('createdBy', t.`created_by`), 'OPEN', NOW(), NOW()
FROM `archive_templates` t
LEFT JOIN `users` u ON u.`id` = t.`created_by`
WHERE t.`created_by` IS NOT NULL AND u.`id` IS NULL
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`);

INSERT INTO `migration_exceptions`
  (`id`, `domain`, `entity_type`, `entity_id`, `code`, `details`, `status`, `created_at`, `updated_at`)
SELECT
  UUID(), 'ARCHIVE_TEMPLATE', 'ArchiveTemplate', t.`id`, 'ORPHAN_UPDATER',
  JSON_OBJECT('updatedBy', t.`updated_by`), 'OPEN', NOW(), NOW()
FROM `archive_templates` t
LEFT JOIN `users` u ON u.`id` = t.`updated_by`
WHERE t.`updated_by` IS NOT NULL AND u.`id` IS NULL
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`);

UPDATE `archive_templates` t
LEFT JOIN `users` u ON u.`id` = t.`created_by`
SET t.`created_by` = NULL
WHERE t.`created_by` IS NOT NULL AND u.`id` IS NULL;

UPDATE `archive_templates` t
LEFT JOIN `users` u ON u.`id` = t.`updated_by`
SET t.`updated_by` = NULL
WHERE t.`updated_by` IS NOT NULL AND u.`id` IS NULL;

ALTER TABLE `archive_templates`
  ADD INDEX `archive_templates_created_by_idx` (`created_by`),
  ADD INDEX `archive_templates_updated_by_idx` (`updated_by`),
  ADD CONSTRAINT `archive_templates_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `archive_templates_updated_by_fkey`
    FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
