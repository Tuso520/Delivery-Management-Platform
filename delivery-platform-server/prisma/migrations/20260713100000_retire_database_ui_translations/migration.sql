-- Fixed interface copy is owned by the frontend vue-i18n catalogs. The
-- translations table was never read by a runtime API and only contains the
-- retired seed catalog. The runtime model is removed, but production rows are
-- retained under an explicitly retired table name instead of being deleted.
--
-- MySQL DDL is implicitly committed, so every gate is retry-safe if a
-- connection is lost after the rename but before Prisma records completion.
SET @translation_source_exists = (
  SELECT COUNT(*)
  FROM `information_schema`.`tables`
  WHERE `table_schema` = DATABASE()
    AND `table_name` = 'translations'
    AND `table_type` = 'BASE TABLE'
);

SET @translation_archive_exists = (
  SELECT COUNT(*)
  FROM `information_schema`.`tables`
  WHERE `table_schema` = DATABASE()
    AND `table_name` = 'retired_ui_translations_20260713'
    AND `table_type` = 'BASE TABLE'
);

SET @translation_state_guard = CASE
  WHEN @translation_source_exists = 1 AND @translation_archive_exists = 0 THEN 'SELECT 1'
  WHEN @translation_source_exists = 0 AND @translation_archive_exists = 1 THEN 'SELECT 1'
  ELSE 'SELECT * FROM `__blocked_ambiguous_translation_retirement_state__`'
END;

PREPARE translation_state_guard_statement FROM @translation_state_guard;
EXECUTE translation_state_guard_statement;
DEALLOCATE PREPARE translation_state_guard_statement;

SET @unexpected_translation_rows = 0;
SET @translation_data_audit = IF(
  @translation_source_exists = 1,
  'SELECT COUNT(*) INTO @unexpected_translation_rows FROM `translations` WHERE `content_type` <> ''ui'' OR `field_name` <> ''label'' OR `language_code` NOT IN (''zh-CN'', ''en-US'')',
  'SELECT 0 INTO @unexpected_translation_rows'
);

PREPARE translation_data_audit_statement FROM @translation_data_audit;
EXECUTE translation_data_audit_statement;
DEALLOCATE PREPARE translation_data_audit_statement;

SET @translation_retirement_guard = IF(
  @unexpected_translation_rows = 0,
  'SELECT 1',
  'SELECT * FROM `__blocked_unknown_translation_rows__`'
);

PREPARE translation_retirement_guard_statement FROM @translation_retirement_guard;
EXECUTE translation_retirement_guard_statement;
DEALLOCATE PREPARE translation_retirement_guard_statement;

SET @translation_archive_sql = IF(
  @translation_source_exists = 1,
  'RENAME TABLE `translations` TO `retired_ui_translations_20260713`',
  'SELECT 1'
);

PREPARE translation_archive_statement FROM @translation_archive_sql;
EXECUTE translation_archive_statement;
DEALLOCATE PREPARE translation_archive_statement;
