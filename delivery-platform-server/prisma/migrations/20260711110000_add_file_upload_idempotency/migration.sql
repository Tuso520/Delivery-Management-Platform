-- Add a nullable global idempotency key without changing existing file versions.
ALTER TABLE `file_versions`
    ADD COLUMN `idempotency_key` VARCHAR(100) NULL;

CREATE UNIQUE INDEX `file_versions_idempotency_key_key`
    ON `file_versions`(`idempotency_key`);
