-- Additive optimistic concurrency token for project commands.
ALTER TABLE `projects`
    ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1;
