-- Despesa fixa: centro de custo passa a ser opcional, como na despesa pontual.
-- A conta gerada a cada mês herda o centro só quando a fixa tiver um.
ALTER TABLE `recurring_payables`
  MODIFY `cost_center_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;
