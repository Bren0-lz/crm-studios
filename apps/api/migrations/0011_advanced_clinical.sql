CREATE TABLE assessment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL,
  specialty text NOT NULL,
  fields jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, name, version)
);

CREATE TABLE clinical_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  template_id uuid NOT NULL REFERENCES assessment_templates(id),
  appointment_id uuid REFERENCES appointments(id),
  author_user_id uuid NOT NULL REFERENCES users(id),
  values jsonb NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE therapeutic_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  author_user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text,
  baseline_value numeric,
  target_value numeric,
  unit text,
  target_date date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'achieved', 'cancelled')),
  achieved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clinical_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  goal_id uuid REFERENCES therapeutic_goals(id),
  author_user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  value numeric NOT NULL,
  unit text NOT NULL,
  measured_at timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE treatment_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  author_user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('discharge', 'referral', 'abandonment')),
  summary text NOT NULL,
  recommendations text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX clinical_assessments_patient_idx
  ON clinical_assessments (clinic_id, patient_id, created_at DESC);
CREATE INDEX therapeutic_goals_patient_idx
  ON therapeutic_goals (clinic_id, patient_id, status, created_at DESC);
CREATE INDEX clinical_measurements_patient_idx
  ON clinical_measurements (clinic_id, patient_id, measured_at DESC);
CREATE INDEX treatment_closures_patient_idx
  ON treatment_closures (clinic_id, patient_id, occurred_at DESC);

INSERT INTO assessment_templates (clinic_id, name, specialty, fields)
SELECT id, 'Avaliação fisioterapêutica geral', 'Fisioterapia',
  '[{"key":"chief_complaint","label":"Queixa principal","type":"text","required":true},{"key":"pain_scale","label":"Escala de dor","type":"scale","required":true,"unit":"0–10","min":0,"max":10},{"key":"range_of_motion","label":"Amplitude de movimento","type":"number","required":false,"unit":"graus"}]'::jsonb
FROM clinics
ON CONFLICT DO NOTHING;
