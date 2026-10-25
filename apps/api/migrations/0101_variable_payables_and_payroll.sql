-- Despesas fixas de valor variável (água, luz): o valor do modelo vira o estimado e a conta
-- gerada fica marcada até a equipe informar o valor real do mês. Aviso no sino N dias antes
-- do vencimento (NULL = sem aviso).
ALTER TABLE recurring_payables
  ADD COLUMN variable_amount boolean NOT NULL DEFAULT false,
  ADD COLUMN reminder_days_before smallint
    CHECK (reminder_days_before BETWEEN 0 AND 28);

ALTER TABLE payables
  ADD COLUMN amount_estimated boolean NOT NULL DEFAULT false;

-- Folha de pagamento: só a parte salarial dos colaboradores. O salário fixo soma as
-- comissões da competência do profissional ligado (quando houver).
CREATE TABLE payroll_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL,
  role text,
  professional_id uuid REFERENCES professionals(id),
  base_salary_in_cents integer NOT NULL CHECK (base_salary_in_cents >= 0),
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payroll_employees_clinic_idx ON payroll_employees (clinic_id, active);

-- Um colaborador por profissional: as comissões não entram duas vezes na folha.
CREATE UNIQUE INDEX payroll_employees_professional_idx
  ON payroll_employees (clinic_id, professional_id)
  WHERE professional_id IS NOT NULL;
