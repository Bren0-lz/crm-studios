-- Despesa avulsa pode ficar sem centro de custo (só a categoria é obrigatória).
ALTER TABLE payables ALTER COLUMN cost_center_id DROP NOT NULL;
