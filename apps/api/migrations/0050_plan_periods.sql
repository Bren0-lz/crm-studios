ALTER TABLE plan_templates ADD COLUMN plan_type text
  CHECK (plan_type IN ('single', 'monthly', 'quarterly', 'semiannual', 'annual', 'promotional'));
ALTER TABLE plan_template_services ADD COLUMN sessions_per_week integer
  CHECK (sessions_per_week BETWEEN 1 AND 7);
-- Existing template quantities and sold balances are preserved.

-- Retain entries from the original name/price catalog for completion in Settings.
INSERT INTO plan_templates (id, clinic_id, name, total_value_in_cents, active)
SELECT c.id, c.clinic_id, c.name, c.total_value_in_cents, false
FROM plan_catalog c
WHERE NOT EXISTS (SELECT 1 FROM plan_templates t WHERE t.id = c.id
  OR (t.clinic_id = c.clinic_id AND t.name = c.name AND t.total_value_in_cents = c.total_value_in_cents));
