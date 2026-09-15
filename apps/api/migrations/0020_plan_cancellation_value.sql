ALTER TABLE patient_plans ADD COLUMN cancelled_value_in_cents integer NOT NULL DEFAULT 0
  CHECK (cancelled_value_in_cents >= 0);

UPDATE patient_plans
SET cancelled_value_in_cents = COALESCE((
  SELECT SUM(r.amount_in_cents)::int
  FROM receivables r
  WHERE r.plan_id = patient_plans.id AND r.status = 'cancelled'
), 0)
WHERE status = 'cancelled';
