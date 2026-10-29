-- Fornecedores: WhatsApp, contratação, valores, pagamento, pedidos e contratos.
ALTER TABLE suppliers
  ADD COLUMN whatsapp text NOT NULL DEFAULT '',
  ADD COLUMN hired_on date,
  ADD COLUMN contract_amount_in_cents integer CHECK (contract_amount_in_cents >= 0),
  ADD COLUMN billing_cycle text NOT NULL DEFAULT 'one_time'
    CHECK (billing_cycle IN ('one_time', 'monthly', 'quarterly', 'yearly')),
  ADD COLUMN payment_method text
    CHECK (payment_method IN ('pix', 'card', 'cash', 'bank_transfer', 'boleto', 'other')),
  ADD COLUMN installments integer NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 120),
  ADD COLUMN payment_terms text NOT NULL DEFAULT '',
  ADD COLUMN orders text NOT NULL DEFAULT '',
  ADD COLUMN contracts text NOT NULL DEFAULT '';
