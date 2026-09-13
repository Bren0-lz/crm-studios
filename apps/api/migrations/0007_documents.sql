CREATE TABLE document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('contract', 'attendance_declaration', 'consent', 'other')),
  version integer NOT NULL CHECK (version > 0),
  body text NOT NULL CHECK (char_length(body) BETWEEN 20 AND 20000),
  active boolean NOT NULL DEFAULT true,
  previous_version_id uuid REFERENCES document_templates(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, name, version)
);

CREATE UNIQUE INDEX document_templates_one_active_idx
  ON document_templates (clinic_id, name) WHERE active;

CREATE TABLE issued_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  template_id uuid NOT NULL REFERENCES document_templates(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  plan_id uuid REFERENCES patient_plans(id),
  title text NOT NULL,
  template_name text NOT NULL,
  template_version integer NOT NULL,
  snapshot_body text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'cancelled')),
  issued_at timestamptz,
  cancelled_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX issued_documents_patient_idx
  ON issued_documents (clinic_id, patient_id, created_at DESC);
