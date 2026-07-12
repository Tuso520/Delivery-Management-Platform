-- Add an optional delivery key so retries can create each in-app notification
-- at most once. Existing notifications remain unchanged.
ALTER TABLE `notifications`
    ADD COLUMN `deduplication_key` VARCHAR(200) NULL;

CREATE UNIQUE INDEX `notifications_deduplication_key_key`
    ON `notifications`(`deduplication_key`);
