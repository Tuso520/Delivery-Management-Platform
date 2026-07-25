-- Permanently retire the enterprise WeChat integration.
-- Data impact:
--   * removes enterprise WeChat integration configs, identities, sync logs, candidates,
--     notification delivery receipts, and the notification-channel dictionary item;
--   * removes the retired channel from notification rules;
--   * disables rules that previously targeted only the retired channel and keeps IN_APP
--     as their explicit, non-sending fallback until an administrator reviews them.
-- This migration intentionally does not alter shared integration/contact-sync tables.
-- Rollback of deleted integration data requires restoring the pre-migration database backup.

UPDATE `notification_rules`
SET
  `channels` = JSON_ARRAY('IN_APP'),
  `is_enabled` = FALSE
WHERE JSON_LENGTH(`channels`) = 1
  AND UPPER(JSON_UNQUOTE(JSON_EXTRACT(`channels`, '$[0]'))) IN (
    'WECOM',
    'WECHAT_WORK',
    'ENTERPRISE_WECHAT'
  );

UPDATE `notification_rules` AS `rule`
JOIN (
  SELECT
    `source`.`id`,
    JSON_ARRAYAGG(`item`.`channel`) AS `retained_channels`
  FROM `notification_rules` AS `source`
  JOIN JSON_TABLE(
    `source`.`channels`,
    '$[*]' COLUMNS (`channel` VARCHAR(20) PATH '$')
  ) AS `item`
  WHERE UPPER(`item`.`channel`) NOT IN ('WECOM', 'WECHAT_WORK', 'ENTERPRISE_WECHAT')
  GROUP BY `source`.`id`
) AS `cleaned` ON `cleaned`.`id` = `rule`.`id`
SET `rule`.`channels` = `cleaned`.`retained_channels`
WHERE EXISTS (
  SELECT 1
  FROM JSON_TABLE(
    `rule`.`channels`,
    '$[*]' COLUMNS (`channel` VARCHAR(20) PATH '$')
  ) AS `retired`
  WHERE UPPER(`retired`.`channel`) IN ('WECOM', 'WECHAT_WORK', 'ENTERPRISE_WECHAT')
);

DELETE FROM `notification_deliveries`
WHERE UPPER(`channel`) IN ('WECOM', 'WECHAT_WORK', 'ENTERPRISE_WECHAT');

DELETE FROM `integration_sync_logs`
WHERE UPPER(`provider`) IN ('WECOM', 'WECHAT_WORK', 'ENTERPRISE_WECHAT');

DELETE FROM `external_contact_candidates`
WHERE UPPER(`provider`) IN ('WECOM', 'WECHAT_WORK', 'ENTERPRISE_WECHAT')
   OR `integration_config_id` IN (
     SELECT `id`
     FROM `integration_configs`
     WHERE UPPER(`provider`) IN ('WECOM', 'WECHAT_WORK', 'ENTERPRISE_WECHAT')
   );

DELETE FROM `external_identities`
WHERE UPPER(`provider`) IN ('WECOM', 'WECHAT_WORK', 'ENTERPRISE_WECHAT')
   OR `integration_config_id` IN (
     SELECT `id`
     FROM `integration_configs`
     WHERE UPPER(`provider`) IN ('WECOM', 'WECHAT_WORK', 'ENTERPRISE_WECHAT')
   );

DELETE FROM `integration_configs`
WHERE UPPER(`provider`) IN ('WECOM', 'WECHAT_WORK', 'ENTERPRISE_WECHAT');

DELETE `item`
FROM `dictionary_items` AS `item`
JOIN `dictionary_categories` AS `category`
  ON `category`.`id` = `item`.`category_id`
WHERE UPPER(`category`.`category_code`) = 'NOTIFICATION_CHANNEL'
  AND UPPER(`item`.`item_value`) IN ('WECOM', 'WECHAT_WORK', 'ENTERPRISE_WECHAT');
