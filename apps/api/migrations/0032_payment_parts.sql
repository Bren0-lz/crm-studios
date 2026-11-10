-- Pagamento picado: as formas (e o valor de cada uma) de um mesmo pagamento.
-- Recebível e conta a pagar: pagos, as formas usadas; recebível aberto, as previstas na venda.
-- Plano: as formas combinadas, cada uma com as próprias cobranças. Vazio = uma forma só.
ALTER TABLE `receivables`
  ADD COLUMN `payment_parts` JSON NOT NULL DEFAULT ('[]');

ALTER TABLE `payables`
  ADD COLUMN `payment_parts` JSON NOT NULL DEFAULT ('[]');

ALTER TABLE `patient_plans`
  ADD COLUMN `payment_parts` JSON NOT NULL DEFAULT ('[]');
