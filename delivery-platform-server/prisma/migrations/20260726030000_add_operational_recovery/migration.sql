ALTER TABLE `file_processing_jobs`
  ADD COLUMN `trace_id` VARCHAR(100) NULL,
  ADD INDEX `file_processing_jobs_trace_id_idx` (`trace_id`);

ALTER TABLE `outbox_events`
  ADD COLUMN `trace_id` VARCHAR(100) NULL,
  ADD INDEX `outbox_events_trace_id_idx` (`trace_id`);

CREATE TABLE `audit_failures` (
  `id` VARCHAR(36) NOT NULL,
  `trace_id` VARCHAR(100) NOT NULL,
  `operation_payload` JSON NOT NULL,
  `failure_code` VARCHAR(100) NOT NULL,
  `failure_message` VARCHAR(1000) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_attempt_at` DATETIME(3) NULL,
  `resolved_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `audit_failures_status_available_at_idx` (`status`, `available_at`),
  INDEX `audit_failures_trace_id_idx` (`trace_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
