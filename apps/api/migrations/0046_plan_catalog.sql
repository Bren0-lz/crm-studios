-- Catalog entries are independent of sold plans, whose terms remain snapshots.
CREATE TABLE plan_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 3 AND 120),
  total_value_in_cents integer NOT NULL CHECK (total_value_in_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_catalog_clinic_idx ON plan_catalog (clinic_id);
