-- Estoque por tamanho: uma linha por produto e tamanho ('' = estoque sem tamanho).
-- products.current_stock continua sendo o total (soma das linhas).
CREATE TABLE product_stock (
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  product_id uuid NOT NULL REFERENCES products(id),
  size text NOT NULL DEFAULT '',
  current_stock integer NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  PRIMARY KEY (product_id, size)
);

INSERT INTO product_stock (clinic_id, product_id, size, current_stock)
SELECT clinic_id, id, '', current_stock FROM products WHERE current_stock > 0;

-- Tamanho movimentado e tamanho vendido ('' = sem tamanho).
ALTER TABLE stock_movements ADD COLUMN size text NOT NULL DEFAULT '';
ALTER TABLE patient_tab_items ADD COLUMN size text NOT NULL DEFAULT '';
ALTER TABLE patient_tab_items DROP CONSTRAINT patient_tab_items_tab_id_product_id_key;
ALTER TABLE patient_tab_items
  ADD CONSTRAINT patient_tab_items_tab_product_size_key UNIQUE (tab_id, product_id, size);
