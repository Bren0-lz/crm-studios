-- O antigo "estoque mínimo" vira o aviso de reposição, opcional: NULL = sem aviso.
-- O mínimo 0 (padrão antigo) não avisava nada além do "sem estoque", então vira NULL.
-- A restrição sai antes da troca de nome: o MySQL não renomeia coluna usada num CHECK.
ALTER TABLE `products` DROP CONSTRAINT products_minimum_stock_check;
ALTER TABLE `products` CHANGE COLUMN `minimum_stock` `restock_alert_at` INT NULL;
ALTER TABLE `products`
  ADD CONSTRAINT products_restock_alert_at_check CHECK ((restock_alert_at >= 0));
UPDATE `products` SET restock_alert_at = NULL WHERE restock_alert_at = 0;
