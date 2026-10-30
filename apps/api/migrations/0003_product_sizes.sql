-- Tamanhos do produto (roupas); vazio = produto sem distinção por tamanhos.
ALTER TABLE `products` ADD COLUMN `sizes` JSON NOT NULL DEFAULT ('[]');
