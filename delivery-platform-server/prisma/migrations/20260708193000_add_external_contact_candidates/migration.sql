CREATE TABLE `external_contact_candidates` (
  `id` VARCHAR(191) NOT NULL,
  `integration_config_id` VARCHAR(36) NOT NULL,
  `provider` VARCHAR(50) NOT NULL,
  `external_user_id` VARCHAR(100) NOT NULL,
  `real_name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `email` VARCHAR(100) NULL,
  `gender` VARCHAR(20) NULL,
  `avatar_url` VARCHAR(500) NULL,
  `department_name` VARCHAR(200) NULL,
  `position_names` JSON NOT NULL,
  `raw_payload` JSON NOT NULL,
  `status` ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
  `reviewed_by` VARCHAR(36) NULL,
  `reviewed_at` DATETIME(3) NULL,
  `approved_user_id` VARCHAR(36) NULL,
  `comment` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `external_contact_candidates_integration_user_key` (`integration_config_id`, `external_user_id`),
  INDEX `external_contact_candidates_provider_status_idx` (`provider`, `status`),
  INDEX `external_contact_candidates_status_created_at_idx` (`status`, `created_at`),
  INDEX `external_contact_candidates_reviewed_by_idx` (`reviewed_by`),
  INDEX `external_contact_candidates_approved_user_id_idx` (`approved_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `external_contact_candidates`
  ADD CONSTRAINT `external_contact_candidates_integration_config_id_fkey`
  FOREIGN KEY (`integration_config_id`) REFERENCES `integration_configs`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `external_contact_candidates`
  ADD CONSTRAINT `external_contact_candidates_reviewed_by_fkey`
  FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `external_contact_candidates`
  ADD CONSTRAINT `external_contact_candidates_approved_user_id_fkey`
  FOREIGN KEY (`approved_user_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
