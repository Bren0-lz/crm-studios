-- Desconto do cliente aplicado ao gerar cada cobrança de plano (parcela ou renovação).
-- amount_in_cents continua sendo o valor cobrado; o valor cheio é a soma dos dois.
ALTER TABLE `receivables`
  ADD COLUMN `customer_discount_in_cents` INT NOT NULL DEFAULT 0,
  ADD CONSTRAINT receivables_customer_discount_in_cents_check CHECK ((customer_discount_in_cents >= 0));
