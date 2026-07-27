DELETE `role_permission`
FROM `role_permissions` AS `role_permission`
JOIN `permissions` AS `permission`
  ON `permission`.`id` = `role_permission`.`permission_id`
WHERE `permission`.`permission_code` = 'archive:item:create_temporary';

DELETE FROM `permissions`
WHERE `permission_code` = 'archive:item:create_temporary';
