-- Despesas fixas de valor variável (água, luz) e aviso antes do vencimento.
-- Na variável, amount_in_cents é a estimativa: a conta do mês nasce com
-- amount_pending = true até a equipe informar o valor real.
ALTER TABLE recurring_payables
  ADD COLUMN amount_type text NOT NULL DEFAULT 'fixed'
    CHECK (amount_type IN ('fixed', 'variable')),
  ADD COLUMN reminder_days_before smallint
    CHECK (reminder_days_before BETWEEN 0 AND 30);

ALTER TABLE payables
  ADD COLUMN amount_pending boolean NOT NULL DEFAULT false;
