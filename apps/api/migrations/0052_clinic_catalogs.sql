CREATE TABLE clinic_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  kind text NOT NULL CHECK (kind IN ('interest','level','product_category','product_brand','muscle_group','lead_source','lead_channel','lead_lost_reason')),
  name text NOT NULL,
  name_key text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  parent_id uuid REFERENCES clinic_catalogs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, kind, name_key)
);
