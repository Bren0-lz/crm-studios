-- Produto não tem mais estoque mínimo: "sem estoque" passa a ser saldo zerado.
ALTER TABLE products DROP COLUMN minimum_stock;
