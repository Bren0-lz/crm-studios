-- Despesas fixas de valor variável (água, luz) e aviso antes do vencimento.
-- Na variável, amount_in_cents é a estimativa: a conta do mês nasce com
-- amount_pending = 1 até a equipe informar o valor real.
ALTER TABLE `recurring_payables`
  ADD COLUMN `amount_type` VARCHAR(191) NOT NULL DEFAULT 'fixed',
  ADD COLUMN `reminder_days_before` SMALLINT,
  ADD CONSTRAINT recurring_payables_amount_type_check CHECK ((amount_type IN ('fixed', 'variable'))),
  ADD CONSTRAINT recurring_payables_reminder_days_before_check CHECK (((reminder_days_before >= 0) AND (reminder_days_before <= 30)));

ALTER TABLE `payables`
  ADD COLUMN `amount_pending` TINYINT(1) NOT NULL DEFAULT 0;
