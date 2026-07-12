-- Preflight the deterministic key before altering the persistent table. The
-- PRIMARY KEY insert deliberately fails when historical active tasks contain
-- duplicates, so deployment stops before adding or backfilling the column.
CREATE TEMPORARY TABLE `_review_task_active_key_preflight` (
    `active_review_key` VARCHAR(160) NOT NULL,
    PRIMARY KEY (`active_review_key`)
) ENGINE = MEMORY;

INSERT INTO `_review_task_active_key_preflight` (`active_review_key`)
SELECT CONCAT(
    `source_type`,
    ':',
    `source_id`,
    ':',
    COALESCE(`source_version_id`, '-')
)
FROM `review_tasks`
WHERE `status` = 'PENDING'
  AND `archived_at` IS NULL;

DROP TEMPORARY TABLE `_review_task_active_key_preflight`;

ALTER TABLE `review_tasks`
    ADD COLUMN `active_review_key` VARCHAR(160) NULL;

UPDATE `review_tasks`
SET `active_review_key` = CONCAT(
    `source_type`,
    ':',
    `source_id`,
    ':',
    COALESCE(`source_version_id`, '-')
)
WHERE `status` = 'PENDING'
  AND `archived_at` IS NULL;

CREATE UNIQUE INDEX `review_tasks_active_review_key_key`
    ON `review_tasks`(`active_review_key`);
