ALTER TABLE `projects`
  ADD COLUMN `contract_type` VARCHAR(20) NULL AFTER `project_type`,
  ADD COLUMN `product` VARCHAR(50) NULL AFTER `contract_type`,
  ADD COLUMN `keywords` JSON NULL AFTER `product`,
  CHANGE COLUMN `electric_leader_id` `electrical_owner_id` VARCHAR(36) NULL,
  CHANGE COLUMN `software_leader_id` `software_owner_id` VARCHAR(36) NULL,
  DROP COLUMN `purchase_owner_id`,
  DROP COLUMN `finance_owner_id`,
  ADD COLUMN `archived_by` VARCHAR(36) NULL AFTER `archived_at`,
  ADD INDEX `projects_archived_by_idx` (`archived_by`);
