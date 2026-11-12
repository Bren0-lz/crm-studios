-- Cor opcional (#rrggbb) da bolinha da etapa do funil comercial.
ALTER TABLE `lead_stages`
  ADD COLUMN `color` VARCHAR(7) NULL AFTER `label`,
  ADD CONSTRAINT `lead_stages_color_check` CHECK (`color` IS NULL OR `color` REGEXP '^#[0-9a-fA-F]{6}$');
