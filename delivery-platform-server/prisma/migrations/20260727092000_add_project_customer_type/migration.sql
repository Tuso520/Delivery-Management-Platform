ALTER TABLE `projects`
  ADD COLUMN `customer_type` VARCHAR(50) NULL AFTER `customer_name`,
  ADD INDEX `projects_customer_type_idx` (`customer_type`);

UPDATE `projects`
SET `customer_type` = CASE `project_type`
  WHEN 'DATA_CENTER' THEN 'IDC'
  WHEN 'FACTORY' THEN 'FACTORY'
  WHEN 'IDC' THEN 'IDC'
  WHEN 'AIDC' THEN 'AIDC'
  WHEN 'COMMERCIAL' THEN 'COMMERCIAL'
  WHEN 'MEDICAL' THEN 'MEDICAL'
  WHEN 'RAIL_TRANSIT' THEN 'RAIL_TRANSIT'
  WHEN 'STANDARD_PRODUCT' THEN 'STANDARD_PRODUCT'
  ELSE `customer_type`
END
WHERE `customer_type` IS NULL
  AND `project_type` IN (
    'DATA_CENTER',
    'FACTORY',
    'IDC',
    'AIDC',
    'COMMERCIAL',
    'MEDICAL',
    'RAIL_TRANSIT',
    'STANDARD_PRODUCT'
  );
