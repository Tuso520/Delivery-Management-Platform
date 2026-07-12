-- Additive cutover for unified external identities, contact-sync leasing, and
-- durable per-channel notification receipts. Historical candidate records are
-- intentionally retained and are not copied or deleted by this migration.

ALTER TABLE `integration_configs`
  ADD COLUMN `contact_sync_lease_owner` VARCHAR(100) NULL,
  ADD COLUMN `contact_sync_lease_expires_at` DATETIME(3) NULL,
  ADD COLUMN `contact_sync_revision` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `last_contact_sync_at` DATETIME(3) NULL;

CREATE INDEX `integration_configs_contact_sync_lease_expires_idx`
  ON `integration_configs`(`contact_sync_lease_expires_at`);

CREATE TABLE `external_identities` (
  `id` VARCHAR(36) NOT NULL,
  `integration_config_id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `provider` VARCHAR(20) NOT NULL,
  `external_user_id` VARCHAR(100) NOT NULL,
  `identifier_type` VARCHAR(30) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `user_provisioned` BOOLEAN NOT NULL DEFAULT false,
  `provisioned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen_at` DATETIME(3) NOT NULL,
  `deactivated_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `external_identities_provider_external_user_uq`(`provider`, `external_user_id`),
  INDEX `external_identities_config_active_idx`(`integration_config_id`, `is_active`),
  INDEX `external_identities_user_active_idx`(`user_id`, `is_active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `external_identities`
  ADD CONSTRAINT `external_identities_integration_config_id_fkey`
  FOREIGN KEY (`integration_config_id`) REFERENCES `integration_configs`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `external_identities_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `notification_deliveries` (
  `id` VARCHAR(36) NOT NULL,
  `event_id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `channel` VARCHAR(20) NOT NULL,
  `status` ENUM('PENDING', 'SENT', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `receipt_id` VARCHAR(200) NULL,
  `error_code` VARCHAR(100) NULL,
  `sent_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `notification_deliveries_event_user_channel_uq`(`event_id`, `user_id`, `channel`),
  INDEX `notification_deliveries_status_updated_idx`(`status`, `updated_at`),
  INDEX `notification_deliveries_user_created_idx`(`user_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `notification_deliveries`
  ADD CONSTRAINT `notification_deliveries_event_id_fkey`
  FOREIGN KEY (`event_id`) REFERENCES `outbox_events`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `notification_deliveries_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
