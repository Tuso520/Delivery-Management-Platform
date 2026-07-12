-- The target columns were backfilled in 20260711107000. Enforce the final
-- notification-rule contract without deleting legacy columns or rows.
ALTER TABLE `notification_rules`
  MODIFY COLUMN `channels` JSON NOT NULL,
  MODIFY COLUMN `recipient_policy` JSON NOT NULL;
