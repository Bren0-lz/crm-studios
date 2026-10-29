-- Parcelamento por forma de pagamento (Configurações › Formas de pagamento).
-- Vazio = sem restrição: toda forma aceita até 36 parcelas até a clínica configurar.
ALTER TABLE clinics
  ADD COLUMN payment_method_settings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN payment_method_settings_updated_at timestamptz;

-- Máximo de parcelas do plano do catálogo: 1 = não aceita parcelamento; NULL = sem limite próprio.
ALTER TABLE plan_templates ADD COLUMN max_installments integer
  CHECK (max_installments BETWEEN 1 AND 36);

-- Parcelas do pagamento na própria forma (ex.: cartão em 3x); NULL = à vista.
ALTER TABLE receivables ADD COLUMN payment_installments integer
  CHECK (payment_installments BETWEEN 1 AND 36);
