CREATE TABLE plan_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 3 AND 120),
  total_value_in_cents integer NOT NULL CHECK (total_value_in_cents >= 0),
  service_id uuid REFERENCES services(id),
  kind text CHECK (kind IN ('single', 'fixed_package', 'recurring', 'custom')),
  total_sessions integer CHECK (total_sessions BETWEEN 1 AND 1000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id)
);
CREATE INDEX plan_templates_clinic_idx ON plan_templates(clinic_id);
ALTER TABLE patient_plans ADD COLUMN plan_template_id uuid;
ALTER TABLE patient_plans ADD CONSTRAINT patient_plans_template_clinic_fk
  FOREIGN KEY (clinic_id, plan_template_id) REFERENCES plan_templates(clinic_id, id);

-- Existing permissions are deliberately unchanged. Admins receive new operations
-- from the permission catalog; other users need an explicit grant.
