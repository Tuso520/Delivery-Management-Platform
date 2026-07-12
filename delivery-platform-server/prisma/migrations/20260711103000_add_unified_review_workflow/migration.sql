-- Additive unified review workflow. Legacy file_reviews remains the active
-- compatibility source until audited rows are migrated into these tables.

CREATE TABLE `review_tasks` (
  `id` VARCHAR(36) NOT NULL,
  `source_type` VARCHAR(30) NOT NULL,
  `source_id` VARCHAR(36) NOT NULL,
  `source_version_id` VARCHAR(36) NULL,
  `project_id` VARCHAR(36) NULL,
  `file_version_id` VARCHAR(36) NULL,
  `approval_template_id` VARCHAR(36) NULL,
  `approval_template_version` VARCHAR(30) NULL,
  `approval_snapshot` JSON NULL,
  `title` VARCHAR(255) NOT NULL,
  `location_label` VARCHAR(500) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `review_mode` VARCHAR(20) NOT NULL DEFAULT 'SINGLE',
  `current_step_no` INTEGER NOT NULL DEFAULT 1,
  `total_steps` INTEGER NOT NULL DEFAULT 1,
  `submitted_by` VARCHAR(36) NOT NULL,
  `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) NULL,
  `due_at` DATETIME(3) NULL,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `review_tasks_source_type_source_id_idx` (`source_type`, `source_id`),
  INDEX `review_tasks_project_id_status_idx` (`project_id`, `status`),
  INDEX `review_tasks_file_version_id_idx` (`file_version_id`),
  INDEX `review_tasks_submitted_by_status_idx` (`submitted_by`, `status`),
  INDEX `review_tasks_status_submitted_at_idx` (`status`, `submitted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `review_steps` (
  `id` VARCHAR(36) NOT NULL,
  `review_task_id` VARCHAR(36) NOT NULL,
  `step_no` INTEGER NOT NULL,
  `mode` VARCHAR(20) NOT NULL DEFAULT 'SINGLE',
  `required_count` INTEGER NOT NULL DEFAULT 1,
  `status` VARCHAR(20) NOT NULL DEFAULT 'WAITING',
  `configuration_snapshot` JSON NULL,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `review_steps_review_task_id_step_no_key`
    (`review_task_id`, `step_no`),
  INDEX `review_steps_status_idx` (`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `review_assignees` (
  `id` VARCHAR(36) NOT NULL,
  `review_step_id` VARCHAR(36) NOT NULL,
  `assignee_user_id` VARCHAR(36) NOT NULL,
  `resolved_from_type` VARCHAR(30) NULL,
  `resolved_from_value` VARCHAR(100) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `decision` VARCHAR(20) NULL,
  `acted_at` DATETIME(3) NULL,
  `comment` TEXT NULL,
  `resolution_metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `review_assignees_review_step_id_assignee_user_id_key`
    (`review_step_id`, `assignee_user_id`),
  INDEX `review_assignees_assignee_user_id_status_idx`
    (`assignee_user_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `review_action_events` (
  `id` VARCHAR(36) NOT NULL,
  `review_task_id` VARCHAR(36) NOT NULL,
  `step_no` INTEGER NULL,
  `actor_user_id` VARCHAR(36) NOT NULL,
  `action` VARCHAR(30) NOT NULL,
  `comment` TEXT NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `review_action_events_review_task_id_created_at_idx`
    (`review_task_id`, `created_at`),
  INDEX `review_action_events_actor_user_id_idx` (`actor_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `review_tasks`
  ADD CONSTRAINT `review_tasks_project_id_fkey`
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `review_tasks_file_version_id_fkey`
    FOREIGN KEY (`file_version_id`) REFERENCES `file_versions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `review_tasks_submitted_by_fkey`
    FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `review_steps`
  ADD CONSTRAINT `review_steps_review_task_id_fkey`
    FOREIGN KEY (`review_task_id`) REFERENCES `review_tasks`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `review_assignees`
  ADD CONSTRAINT `review_assignees_review_step_id_fkey`
    FOREIGN KEY (`review_step_id`) REFERENCES `review_steps`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `review_assignees_assignee_user_id_fkey`
    FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `review_action_events`
  ADD CONSTRAINT `review_action_events_review_task_id_fkey`
    FOREIGN KEY (`review_task_id`) REFERENCES `review_tasks`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `review_action_events_actor_user_id_fkey`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
