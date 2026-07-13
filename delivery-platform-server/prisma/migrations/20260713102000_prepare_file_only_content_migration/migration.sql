-- Expand-only preparation for the standard file backfill and the knowledge
-- single-primary-content audit. No business row or legacy content column is
-- removed by this migration.
--
-- MySQL does not permit a CHECK constraint to reference file_version_id while
-- that column participates in an ON DELETE/ON UPDATE foreign-key action. The
-- exact content contract is therefore enforced by the idempotent
-- prisma:migrate-target-content --verify --strict gate until the compatibility
-- columns and their foreign-key transition can be retired in a later release.

-- MySQL DDL is implicitly committed. Guard each index so a deployment can be
-- retried safely after a connection loss between statements.
SET @target_content_index_sql = IF(
  EXISTS(
    SELECT 1
    FROM `information_schema`.`statistics`
    WHERE `table_schema` = DATABASE()
      AND `table_name` = 'standard_versions'
      AND `index_name` = 'standard_versions_status_archived_at_idx'
  ),
  'SELECT 1',
  'CREATE INDEX `standard_versions_status_archived_at_idx` ON `standard_versions` (`status`, `archived_at`)'
);
PREPARE target_content_index_stmt FROM @target_content_index_sql;
EXECUTE target_content_index_stmt;
DEALLOCATE PREPARE target_content_index_stmt;

SET @target_content_index_sql = IF(
  EXISTS(
    SELECT 1
    FROM `information_schema`.`statistics`
    WHERE `table_schema` = DATABASE()
      AND `table_name` = 'knowledge_versions_v2'
      AND `index_name` = 'knowledge_versions_v2_content_type_status_archived_idx'
  ),
  'SELECT 1',
  'CREATE INDEX `knowledge_versions_v2_content_type_status_archived_idx` ON `knowledge_versions_v2` (`content_type`, `status`, `archived_at`)'
);
PREPARE target_content_index_stmt FROM @target_content_index_sql;
EXECUTE target_content_index_stmt;
DEALLOCATE PREPARE target_content_index_stmt;

SET @target_content_index_sql = IF(
  EXISTS(
    SELECT 1
    FROM `information_schema`.`statistics`
    WHERE `table_schema` = DATABASE()
      AND `table_name` = 'migration_exceptions'
      AND `index_name` = 'migration_exceptions_domain_code_status_idx'
  ),
  'SELECT 1',
  'CREATE INDEX `migration_exceptions_domain_code_status_idx` ON `migration_exceptions` (`domain`, `code`, `status`)'
);
PREPARE target_content_index_stmt FROM @target_content_index_sql;
EXECUTE target_content_index_stmt;
DEALLOCATE PREPARE target_content_index_stmt;
