-- Despesa fixa de valor variável pode ser cadastrada sem estimativa
-- (amount_in_cents = 0). A conta do mês nasce com valor 0 e amount_pending = 1,
-- e só pode ser paga depois que a equipe informar o valor real.
ALTER TABLE `recurring_payables`
  DROP CONSTRAINT recurring_payables_amount_in_cents_check;
ALTER TABLE `recurring_payables`
  ADD CONSTRAINT recurring_payables_amount_in_cents_check
    CHECK ((amount_in_cents > 0) OR ((amount_type = 'variable') AND (amount_in_cents = 0)));

ALTER TABLE `payables`
  DROP CONSTRAINT payables_amount_in_cents_check;
ALTER TABLE `payables`
  ADD CONSTRAINT payables_amount_in_cents_check
    CHECK ((amount_in_cents > 0) OR (amount_pending AND (amount_in_cents = 0)));
