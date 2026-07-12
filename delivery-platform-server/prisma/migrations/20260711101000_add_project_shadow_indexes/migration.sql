-- Kept separate from the column migration so production operators can
-- schedule the index build in the appropriate maintenance window.

ALTER TABLE `projects`
  ADD INDEX `projects_lifecycle_status_v2_deleted_at_idx`
    (`lifecycle_status_v2`, `deleted_at`),
  ADD INDEX `projects_delivery_stage_v2_idx` (`delivery_stage_v2`),
  ADD INDEX `projects_expected_acceptance_at_idx` (`expected_acceptance_at`),
  ADD INDEX `projects_archived_at_idx` (`archived_at`);
