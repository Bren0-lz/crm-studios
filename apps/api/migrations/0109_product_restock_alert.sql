-- O antigo "estoque mínimo" vira o aviso de reposição, opcional: NULL = sem aviso.
-- O mínimo 0 (padrão antigo) não avisava nada além do "sem estoque", então vira NULL.
ALTER TABLE products RENAME COLUMN minimum_stock TO restock_alert_at;
ALTER TABLE products ALTER COLUMN restock_alert_at DROP NOT NULL;
ALTER TABLE products ALTER COLUMN restock_alert_at DROP DEFAULT;
UPDATE products SET restock_alert_at = NULL WHERE restock_alert_at = 0;
