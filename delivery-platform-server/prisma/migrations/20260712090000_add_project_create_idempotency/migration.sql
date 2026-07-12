-- Additive project-create idempotency metadata. Existing rows remain valid with NULL values.
ALTER TABLE `projects`
    ADD COLUMN `create_idempotency_key` VARCHAR(100) NULL,
    ADD COLUMN `create_request_hash` CHAR(64) NULL;

CREATE UNIQUE INDEX `projects_create_idempotency_key_key`
    ON `projects`(`create_idempotency_key`);
