CREATE TYPE lead_stage AS ENUM ('new_contact', 'contacted', 'evaluation', 'proposal', 'won', 'lost');

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  source text NOT NULL,
  interest text NOT NULL,
  notes text,
  stage lead_stage NOT NULL DEFAULT 'new_contact',
  lost_reason text,
  converted_patient_id uuid REFERENCES patients(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (stage <> 'lost' OR lost_reason IS NOT NULL)
);

CREATE INDEX leads_pipeline_idx ON leads (clinic_id, stage, updated_at DESC);
CREATE INDEX leads_contact_idx ON leads (clinic_id, phone, lower(email));

CREATE TABLE lead_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  lead_id uuid NOT NULL REFERENCES leads(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  from_stage lead_stage,
  to_stage lead_stage NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_history_idx ON lead_stage_history (clinic_id, lead_id, created_at DESC);
