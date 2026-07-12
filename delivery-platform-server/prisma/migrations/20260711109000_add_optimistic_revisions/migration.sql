-- Optimistic revisions protect mutable draft versions from silent overwrite.
ALTER TABLE `archive_template_versions`
  ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1 AFTER `status`;

ALTER TABLE `standard_versions`
  ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1 AFTER `status`;

ALTER TABLE `knowledge_versions_v2`
  ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1 AFTER `status`;
