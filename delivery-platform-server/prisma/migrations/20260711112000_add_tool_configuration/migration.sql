-- Tool definitions reuse the existing tool catalog while gaining an optional,
-- domain-owned configuration document. Existing rows remain unchanged.
ALTER TABLE `tool_items`
  ADD COLUMN `configuration` JSON NULL AFTER `icon`;
