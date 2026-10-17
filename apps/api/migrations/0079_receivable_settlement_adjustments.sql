-- U39: baixa com desconto, juros e pagamento parcial.
-- O evento de pagamento guarda o valor efetivamente recebido (amount_in_cents), o desconto e
-- os juros aplicados; no pagamento parcial, aponta a parcela criada com o saldo.
ALTER TABLE financial_events
  ADD COLUMN discount_in_cents integer NOT NULL DEFAULT 0 CHECK (discount_in_cents >= 0),
  ADD COLUMN interest_in_cents integer NOT NULL DEFAULT 0 CHECK (interest_in_cents >= 0),
  ADD COLUMN balance_receivable_id uuid REFERENCES receivables(id);
