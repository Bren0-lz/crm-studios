-- Estoque por tamanho: uma linha por produto e tamanho ('' = estoque sem tamanho).
-- products.current_stock continua sendo o total (soma das linhas).
CREATE TABLE `product_stock` (
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `size` VARCHAR(191) NOT NULL DEFAULT '',
  `current_stock` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`product_id`, `size`),
  CONSTRAINT product_stock_current_stock_check CHECK ((current_stock >= 0)),
  CONSTRAINT product_stock_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  CONSTRAINT product_stock_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT INTO `product_stock` (clinic_id, product_id, size, current_stock)
SELECT clinic_id, id, '', current_stock FROM `products` WHERE current_stock > 0;

-- Tamanho movimentado e tamanho vendido ('' = sem tamanho).
ALTER TABLE `stock_movements` ADD COLUMN `size` VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE `patient_tab_items` ADD COLUMN `size` VARCHAR(191) NOT NULL DEFAULT '';
-- A chave nova entra antes de sair a antiga: a FK de tab_id precisa de um índice.
ALTER TABLE `patient_tab_items`
  ADD CONSTRAINT patient_tab_items_tab_product_size_key UNIQUE (tab_id, product_id, size);
ALTER TABLE `patient_tab_items` DROP INDEX patient_tab_items_tab_id_product_id_key;
