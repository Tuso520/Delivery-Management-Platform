-- Settings-domain target fields are additive so legacy routes and data remain usable
-- throughout the compatibility period.

ALTER TABLE `notification_rules`
  ADD COLUMN `channels` JSON NULL,
  ADD COLUMN `recipient_policy` JSON NULL,
  ADD COLUMN `template_id` VARCHAR(36) NULL;

UPDATE `notification_rules`
SET
  `channels` = JSON_ARRAY(
    CASE LOWER(`channel`)
      WHEN 'feishu' THEN 'FEISHU'
      WHEN 'wecom' THEN 'WECOM'
      WHEN 'enterprise_wechat' THEN 'WECOM'
      ELSE 'IN_APP'
    END
  ),
  `recipient_policy` = CASE
    WHEN `recipient_role` IS NOT NULL AND `recipient_role` <> ''
      THEN JSON_OBJECT('type', 'ROLE', 'values', JSON_ARRAY(`recipient_role`))
    ELSE JSON_OBJECT('type', 'BUSINESS_OWNER', 'values', JSON_ARRAY())
  END
WHERE `channels` IS NULL OR `recipient_policy` IS NULL;

CREATE INDEX `notification_rules_event_type_deleted_at_updated_at_idx`
  ON `notification_rules`(`event_type`, `deleted_at`, `updated_at`);

ALTER TABLE `operation_logs`
  ADD COLUMN `trace_id` VARCHAR(100) NULL,
  ADD COLUMN `error_reason` VARCHAR(1000) NULL;

CREATE INDEX `operation_logs_trace_id_idx` ON `operation_logs`(`trace_id`);

ALTER TABLE `approval_templates`
  ADD COLUMN `deleted_at` DATETIME(3) NULL;

CREATE INDEX `approval_templates_deleted_at_idx` ON `approval_templates`(`deleted_at`);

ALTER TABLE `integration_configs`
  ADD COLUMN `encrypted_config` TEXT NULL;

CREATE INDEX `integration_configs_provider_updated_at_idx`
  ON `integration_configs`(`provider`, `updated_at`);

CREATE TABLE `integration_sync_logs` (
  `id` VARCHAR(36) NOT NULL,
  `integration_config_id` VARCHAR(36) NULL,
  `provider` VARCHAR(20) NOT NULL,
  `action` VARCHAR(40) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `summary` JSON NULL,
  `error_reason` VARCHAR(1000) NULL,
  `requested_by` VARCHAR(36) NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `integration_sync_logs_provider_created_at_idx`(`provider`, `created_at`),
  INDEX `integration_sync_logs_integration_config_id_created_at_idx`(`integration_config_id`, `created_at`),
  INDEX `integration_sync_logs_requested_by_idx`(`requested_by`),
  PRIMARY KEY (`id`),
  CONSTRAINT `integration_sync_logs_integration_config_id_fkey`
    FOREIGN KEY (`integration_config_id`) REFERENCES `integration_configs`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `integration_sync_logs_requested_by_fkey`
    FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
