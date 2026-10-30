-- Parcelamento por forma de pagamento (Configurações › Formas de pagamento).
-- Vazio = sem restrição: toda forma aceita até 36 parcelas até a clínica configurar.
ALTER TABLE `clinics`
  ADD COLUMN `payment_method_settings` JSON NOT NULL DEFAULT ('[]'),
  ADD COLUMN `payment_method_settings_updated_at` DATETIME(6);

-- Máximo de parcelas do plano do catálogo: 1 = não aceita parcelamento; NULL = sem limite próprio.
ALTER TABLE `plan_templates`
  ADD COLUMN `max_installments` INT,
  ADD CONSTRAINT plan_templates_max_installments_check CHECK (((max_installments >= 1) AND (max_installments <= 36)));

-- Parcelas do pagamento na própria forma (ex.: cartão em 3x); NULL = à vista.
ALTER TABLE `receivables`
  ADD COLUMN `payment_installments` INT,
  ADD CONSTRAINT receivables_payment_installments_check CHECK (((payment_installments >= 1) AND (payment_installments <= 36)));
