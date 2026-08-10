ALTER TABLE `projects`
  ADD COLUMN `accepted_converted_amount` DECIMAL(18, 2) NULL AFTER `converted_amount`;

UPDATE `projects`
SET `accepted_converted_amount` = `converted_amount`
WHERE `accepted_converted_amount` IS NULL;
