-- Expand approval configuration from one approver selector per step to an
-- immutable multi-assignee policy. Existing rows are migrated losslessly to
-- SINGLE mode before the retired scalar column is removed.
ALTER TABLE `approval_steps`
  ADD COLUMN `mode` VARCHAR(20) NOT NULL DEFAULT 'SINGLE',
  ADD COLUMN `required_count` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `approver_values` JSON NULL;

UPDATE `approval_steps`
SET `approver_values` = JSON_ARRAY(`approver_value`);

ALTER TABLE `approval_steps`
  MODIFY COLUMN `approver_values` JSON NOT NULL,
  DROP COLUMN `approver_value`;
