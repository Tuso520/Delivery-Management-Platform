-- Phase 2 project refactor shadow fields. All columns are nullable so current
-- reads and writes remain valid while status/stage mappings are verified.

ALTER TABLE `projects`
  ADD COLUMN `short_name` VARCHAR(100) NULL,
  ADD COLUMN `lifecycle_status_v2` VARCHAR(20) NULL,
  ADD COLUMN `delivery_stage_v2` VARCHAR(30) NULL,
  ADD COLUMN `progress_percent` DECIMAL(5, 2) NULL,
  ADD COLUMN `risk_description` TEXT NULL,
  ADD COLUMN `contract_no` VARCHAR(100) NULL,
  ADD COLUMN `contract_signed_at` DATETIME(3) NULL,
  ADD COLUMN `expected_acceptance_at` DATETIME(3) NULL,
  ADD COLUMN `actual_acceptance_at` DATETIME(3) NULL,
  ADD COLUMN `archived_at` DATETIME(3) NULL;
