-- Renovação de planos: cada plano pode gerar um único sucessor (manual ou automático).
-- A renovação automática só vale para planos com fim de validade.
ALTER TABLE patient_plans
  ADD COLUMN auto_renew boolean NOT NULL DEFAULT false,
  ADD COLUMN renewed_from_plan_id uuid REFERENCES patient_plans(id),
  ADD CONSTRAINT patient_plans_auto_renew_period
    CHECK (NOT auto_renew OR valid_until IS NOT NULL);

CREATE UNIQUE INDEX patient_plans_single_renewal_idx
  ON patient_plans (renewed_from_plan_id)
  WHERE renewed_from_plan_id IS NOT NULL;

CREATE INDEX patient_plans_auto_renew_idx
  ON patient_plans (clinic_id, valid_until)
  WHERE auto_renew;
