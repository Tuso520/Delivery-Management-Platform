-- Add durable scheduling and lease metadata for multi-instance file workers.
-- Existing rows are preserved and become immediately eligible for processing.
ALTER TABLE `file_processing_jobs`
    ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `lease_owner` VARCHAR(100) NULL,
    ADD COLUMN `lease_expires_at` DATETIME(3) NULL;

DROP INDEX `file_processing_jobs_status_created_at_idx` ON `file_processing_jobs`;

CREATE INDEX `file_processing_jobs_status_available_created_idx`
    ON `file_processing_jobs`(`status`, `available_at`, `created_at`);

CREATE INDEX `file_processing_jobs_status_lease_expires_idx`
    ON `file_processing_jobs`(`status`, `lease_expires_at`);
