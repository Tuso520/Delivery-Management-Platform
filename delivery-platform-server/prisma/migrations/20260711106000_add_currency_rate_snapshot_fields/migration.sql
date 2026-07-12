ALTER TABLE `currencies`
  ADD COLUMN `cny_rate` DECIMAL(18, 8) NULL,
  ADD COLUMN `rate_date` DATETIME(3) NULL,
  ADD COLUMN `rate_locked` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `locked_by` VARCHAR(36) NULL,
  ADD COLUMN `locked_at` DATETIME(3) NULL,
  ADD COLUMN `rate_source` VARCHAR(100) NULL,
  ADD INDEX `currencies_status_rate_locked_idx` (`status`, `rate_locked`);
