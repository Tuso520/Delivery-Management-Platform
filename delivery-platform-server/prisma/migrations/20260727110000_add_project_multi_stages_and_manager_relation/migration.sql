ALTER TABLE `projects`
  ADD COLUMN `current_stages` JSON NULL AFTER `current_stage`;

UPDATE `projects`
SET `current_stages` = JSON_ARRAY(`current_stage`)
WHERE `current_stages` IS NULL;

UPDATE `projects` AS `project`
LEFT JOIN `users` AS `manager`
  ON `manager`.`id` = `project`.`project_manager_id`
SET `project`.`project_manager_id` = NULL
WHERE `project`.`project_manager_id` IS NOT NULL
  AND `manager`.`id` IS NULL;

ALTER TABLE `projects`
  ADD INDEX `projects_project_manager_id_idx` (`project_manager_id`),
  ADD CONSTRAINT `projects_project_manager_id_fkey`
    FOREIGN KEY (`project_manager_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
