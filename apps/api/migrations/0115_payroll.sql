-- Folha de pagamento: colaboradores com salário fixo (e o profissional da agenda, para as
-- comissões). Lançar a folha cria uma despesa por colaborador com salário + comissões +
-- ajustes; pagar a despesa paga as comissões e os ajustes incluídos.
CREATE TABLE payroll_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  branch_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) >= 2),
  role text,
  professional_id uuid REFERENCES professionals(id),
  base_salary_in_cents integer NOT NULL CHECK (base_salary_in_cents >= 0),
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, branch_id) REFERENCES branches (clinic_id, id)
);
CREATE INDEX payroll_employees_branch_idx ON payroll_employees (clinic_id, branch_id);
-- Um colaborador por profissional: a comissão não entra em duas folhas.
CREATE UNIQUE INDEX payroll_employees_professional_idx
  ON payroll_employees (clinic_id, professional_id)
  WHERE professional_id IS NOT NULL;

-- Despesa lançada pela folha: colaborador, competência e quanto é salário e quanto é
-- comissão (comissões + ajustes). Na DRE só o salário entra pela despesa.
ALTER TABLE payables
  ADD COLUMN payroll_employee_id uuid,
  ADD COLUMN payroll_competence char(7),
  ADD COLUMN payroll_salary_in_cents integer,
  ADD COLUMN payroll_commission_in_cents integer,
  ADD CONSTRAINT payables_payroll_employee_fk
    FOREIGN KEY (clinic_id, payroll_employee_id) REFERENCES payroll_employees (clinic_id, id),
  ADD CONSTRAINT payables_payroll_fields CHECK (
    (payroll_employee_id IS NULL AND payroll_competence IS NULL
      AND payroll_salary_in_cents IS NULL AND payroll_commission_in_cents IS NULL)
    OR (payroll_employee_id IS NOT NULL AND payroll_competence IS NOT NULL
      AND payroll_salary_in_cents IS NOT NULL AND payroll_commission_in_cents IS NOT NULL)
  );
CREATE INDEX payables_payroll_idx ON payables (clinic_id, payroll_competence)
  WHERE payroll_employee_id IS NOT NULL;

-- Comissão e ajuste incluídos numa despesa da folha (o pagamento segue a despesa).
ALTER TABLE commission_entries ADD COLUMN payroll_payable_id uuid REFERENCES payables(id);
ALTER TABLE commission_adjustments ADD COLUMN payroll_payable_id uuid REFERENCES payables(id);
CREATE INDEX commission_entries_payroll_idx ON commission_entries (payroll_payable_id)
  WHERE payroll_payable_id IS NOT NULL;
CREATE INDEX commission_adjustments_payroll_idx ON commission_adjustments (payroll_payable_id)
  WHERE payroll_payable_id IS NOT NULL;

-- O pagamento de comissão passa a ser feito pela folha: quem pagava comissão ganha acesso à
-- folha.
UPDATE users SET permissions = permissions || ARRAY(
  SELECT key FROM unnest(ARRAY['finance.payroll_view', 'finance.payroll_manage']) AS key
  WHERE NOT key = ANY(users.permissions)
)
WHERE 'finance.commissions_pay' = ANY(permissions);
