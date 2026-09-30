-- Despesas fixas recorrentes: modelo que gera uma conta a pagar por competência
-- (AAAA-MM). resumed_from_month guarda o mês da última reativação, para não
-- gerar as competências do período em que o modelo ficou pausado.
CREATE TABLE recurring_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  description text NOT NULL,
  supplier text,
  category_id uuid NOT NULL REFERENCES financial_categories(id),
  cost_center_id uuid NOT NULL REFERENCES cost_centers(id),
  amount_in_cents integer NOT NULL CHECK (amount_in_cents > 0),
  day_of_month smallint NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
  start_month text NOT NULL CHECK (start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  end_month text CHECK (end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  active boolean NOT NULL DEFAULT true,
  resumed_from_month text CHECK (resumed_from_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_payables_period_check
    CHECK (end_month IS NULL OR end_month >= start_month)
);

CREATE INDEX recurring_payables_clinic_idx ON recurring_payables (clinic_id, active);

ALTER TABLE payables
  ADD COLUMN recurring_payable_id uuid REFERENCES recurring_payables(id),
  ADD COLUMN competence text CHECK (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT payables_recurring_link_check
    CHECK ((recurring_payable_id IS NULL) = (competence IS NULL));

-- Uma conta a pagar por modelo e competência: a geração é idempotente.
CREATE UNIQUE INDEX payables_recurring_competence_idx
  ON payables (recurring_payable_id, competence)
  WHERE recurring_payable_id IS NOT NULL;
