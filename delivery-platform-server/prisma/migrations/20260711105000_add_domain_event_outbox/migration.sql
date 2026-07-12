CREATE TABLE `outbox_events` (
  `id` VARCHAR(36) NOT NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `aggregate_type` VARCHAR(50) NOT NULL,
  `aggregate_id` VARCHAR(36) NOT NULL,
  `payload` JSON NOT NULL,
  `deduplication_key` VARCHAR(200) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `last_error` TEXT NULL,
  `processed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `outbox_events_deduplication_key_key` (`deduplication_key`),
  INDEX `outbox_events_status_available_at_idx` (`status`, `available_at`),
  INDEX `outbox_events_aggregate_type_aggregate_id_idx`
    (`aggregate_type`, `aggregate_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
