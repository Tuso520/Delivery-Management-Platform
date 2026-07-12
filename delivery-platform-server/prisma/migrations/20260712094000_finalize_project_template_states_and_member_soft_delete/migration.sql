-- Preserve every legacy project state before removing duplicate runtime columns.
-- This table is intentionally read-only from the application and provides a
-- durable audit/rollback source without keeping two state models in runtime.
CREATE TABLE `project_legacy_state_archive` (
    `project_id` VARCHAR(36) NOT NULL,
    `legacy_project_status` VARCHAR(30) NOT NULL,
    `legacy_current_stage` VARCHAR(30) NULL,
    `mapped_status` VARCHAR(20) NULL,
    `mapped_current_stage` VARCHAR(30) NULL,
    `archived_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`project_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `project_legacy_state_archive` (
    `project_id`,
    `legacy_project_status`,
    `legacy_current_stage`,
    `mapped_status`,
    `mapped_current_stage`
)
SELECT
    `id`,
    CAST(`project_status` AS CHAR),
    `current_stage`,
    `lifecycle_status_v2`,
    `delivery_stage_v2`
FROM `projects`;

-- Complete any shadow-field backfill deterministically. Existing target values
-- are never overwritten, so previously reviewed migration decisions win.
UPDATE `projects`
SET `lifecycle_status_v2` = CASE CAST(`project_status` AS CHAR)
    WHEN 'Draft' THEN 'DRAFT'
    WHEN 'Active' THEN 'ACTIVE'
    WHEN 'Delayed' THEN 'ACTIVE'
    WHEN 'Suspended' THEN 'PAUSED'
    WHEN 'Accepted' THEN 'COMPLETED'
    WHEN 'Archived' THEN 'COMPLETED'
    WHEN 'Closed' THEN 'COMPLETED'
    ELSE NULL
END
WHERE `lifecycle_status_v2` IS NULL;

UPDATE `projects`
SET `delivery_stage_v2` = CASE LOWER(COALESCE(`current_stage`, ''))
    WHEN '01_presale' THEN 'STARTUP'
    WHEN '01_sale' THEN 'STARTUP'
    WHEN 'startup' THEN 'STARTUP'
    WHEN '02_design' THEN 'DEEPENING'
    WHEN 'deepening' THEN 'DEEPENING'
    WHEN '03_procurement' THEN 'PROCUREMENT'
    WHEN 'procurement' THEN 'PROCUREMENT'
    WHEN '04_construction' THEN 'CONSTRUCTION'
    WHEN 'construction' THEN 'CONSTRUCTION'
    WHEN '04_commissioning' THEN 'COMMISSIONING'
    WHEN 'commissioning' THEN 'COMMISSIONING'
    WHEN '04_testing' THEN 'TESTING'
    WHEN 'testing' THEN 'TESTING'
    WHEN 'internal_acceptance' THEN 'INTERNAL_ACCEPTANCE'
    WHEN '05_acceptance' THEN 'EXTERNAL_ACCEPTANCE'
    WHEN 'external_acceptance' THEN 'EXTERNAL_ACCEPTANCE'
    WHEN '06_review' THEN 'WARRANTY'
    WHEN 'warranty' THEN 'WARRANTY'
    WHEN '' THEN 'STARTUP'
    ELSE NULL
END
WHERE `delivery_stage_v2` IS NULL;

-- Unrecognized legacy values must never be disguised as a successful default
-- mapping. Record them for review and let the NOT NULL preflight below stop the
-- destructive column switch while the original values remain intact.
INSERT INTO `migration_exceptions`
    (`id`, `domain`, `entity_type`, `entity_id`, `code`, `details`, `status`, `created_at`, `updated_at`)
SELECT
    UUID(),
    'PROJECT',
    'Project',
    `id`,
    'UNMAPPED_LEGACY_PROJECT_STATUS',
    JSON_OBJECT('legacyProjectStatus', CAST(`project_status` AS CHAR)),
    'OPEN',
    NOW(3),
    NOW(3)
FROM `projects`
WHERE `lifecycle_status_v2` IS NULL
ON DUPLICATE KEY UPDATE
    `details` = VALUES(`details`),
    `status` = 'OPEN',
    `resolved_by` = NULL,
    `resolved_at` = NULL,
    `updated_at` = VALUES(`updated_at`);

INSERT INTO `migration_exceptions`
    (`id`, `domain`, `entity_type`, `entity_id`, `code`, `details`, `status`, `created_at`, `updated_at`)
SELECT
    UUID(),
    'PROJECT',
    'Project',
    `id`,
    'UNMAPPED_LEGACY_PROJECT_STAGE',
    JSON_OBJECT('legacyCurrentStage', `current_stage`),
    'OPEN',
    NOW(3),
    NOW(3)
FROM `projects`
WHERE `delivery_stage_v2` IS NULL
ON DUPLICATE KEY UPDATE
    `details` = VALUES(`details`),
    `status` = 'OPEN',
    `resolved_by` = NULL,
    `resolved_at` = NULL,
    `updated_at` = VALUES(`updated_at`);

UPDATE `projects`
SET `archived_at` = `updated_at`
WHERE CAST(`project_status` AS CHAR) = 'Archived'
  AND `archived_at` IS NULL;

UPDATE `project_legacy_state_archive` AS `archive`
INNER JOIN `projects` AS `project` ON `project`.`id` = `archive`.`project_id`
SET
    `archive`.`mapped_status` = `project`.`lifecycle_status_v2`,
    `archive`.`mapped_current_stage` = `project`.`delivery_stage_v2`;

-- A NULL insert deliberately fails before destructive column removal if any
-- target state is incomplete or outside the final state dictionaries.
CREATE TEMPORARY TABLE `_project_state_preflight` (
    `project_id` VARCHAR(36) NOT NULL,
    `validation_token` VARCHAR(2) NOT NULL,
    PRIMARY KEY (`project_id`)
) ENGINE = MEMORY;

INSERT INTO `_project_state_preflight` (`project_id`, `validation_token`)
SELECT
    `id`,
    CASE
        WHEN `lifecycle_status_v2` IN ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')
         AND `delivery_stage_v2` IN (
             'STARTUP',
             'DEEPENING',
             'PROCUREMENT',
             'CONSTRUCTION',
             'COMMISSIONING',
             'TESTING',
             'INTERNAL_ACCEPTANCE',
             'EXTERNAL_ACCEPTANCE',
             'WARRANTY'
         )
        THEN 'OK'
        ELSE NULL
    END
FROM `projects`;

DROP TEMPORARY TABLE `_project_state_preflight`;

ALTER TABLE `projects`
    DROP INDEX `projects_project_status_idx`,
    DROP INDEX `projects_lifecycle_status_v2_deleted_at_idx`,
    DROP INDEX `projects_delivery_stage_v2_idx`,
    DROP COLUMN `project_status`,
    DROP COLUMN `current_stage`;

ALTER TABLE `projects`
    CHANGE COLUMN `lifecycle_status_v2` `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    CHANGE COLUMN `delivery_stage_v2` `current_stage` VARCHAR(30) NOT NULL DEFAULT 'STARTUP',
    ADD INDEX `projects_status_deleted_at_idx` (`status`, `deleted_at`),
    ADD INDEX `projects_current_stage_idx` (`current_stage`);

-- Normalize the aggregate archive-template lifecycle to the same explicit
-- version states used by the review workflow.
UPDATE `archive_templates` AS `template`
SET `template`.`status` = CASE
    WHEN `template`.`status` IN ('Disabled', 'Inactive', 'DISABLED') THEN 'DISABLED'
    ELSE COALESCE(
        (
            SELECT `latest`.`status`
            FROM `archive_template_versions` AS `latest`
            WHERE `latest`.`template_id` = `template`.`id`
            ORDER BY `latest`.`created_at` DESC, `latest`.`id` DESC
            LIMIT 1
        ),
        CASE
            WHEN `template`.`current_published_version_id` IS NOT NULL THEN 'PUBLISHED'
            ELSE 'DRAFT'
        END
    )
END;

ALTER TABLE `archive_templates`
    MODIFY COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT';

-- Project membership is core business data. Removal is now a reversible soft
-- delete while the original uniqueness key supports safe reactivation.
ALTER TABLE `project_members`
    ADD COLUMN `deleted_at` DATETIME(3) NULL,
    ADD INDEX `project_members_project_id_deleted_at_idx` (`project_id`, `deleted_at`),
    ADD INDEX `project_members_user_id_deleted_at_idx` (`user_id`, `deleted_at`);
