-- Add sales owner to project ledger leadership fields.
ALTER TABLE `projects` ADD COLUMN `sales_owner_id` VARCHAR(36) NULL AFTER `project_language`;
