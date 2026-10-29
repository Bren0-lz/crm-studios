-- Desconto do cliente aplicado ao gerar cada cobrança de plano (parcela ou renovação).
-- amount_in_cents continua sendo o valor cobrado; o valor cheio é a soma dos dois.
ALTER TABLE receivables
  ADD COLUMN customer_discount_in_cents integer NOT NULL DEFAULT 0
    CHECK (customer_discount_in_cents >= 0);
