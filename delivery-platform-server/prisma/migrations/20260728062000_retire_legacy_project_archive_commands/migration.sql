DELETE `role_permission`
FROM `role_permissions` AS `role_permission`
JOIN `permissions` AS `permission`
  ON `permission`.`id` = `role_permission`.`permission_id`
WHERE `permission`.`permission_code` IN (
  'archive:item:archive',
  'archive:template:sync'
);

DELETE FROM `permissions`
WHERE `permission_code` IN (
  'archive:item:archive',
  'archive:template:sync'
);
