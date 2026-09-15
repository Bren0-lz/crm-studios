ALTER TABLE patient_plans ADD COLUMN cancelled_at timestamptz;

UPDATE patient_plans
SET cancelled_at = updated_at
WHERE status = 'cancelled';

CREATE INDEX patient_plans_sales_dates_idx
  ON patient_plans (clinic_id, created_at, cancelled_at);
