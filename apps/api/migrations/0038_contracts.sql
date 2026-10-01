-- Contratos: volta a funcionalidade de modelos versionados e documentos
-- emitidos, apagada na 0036. Estrutura da 0007 com o profissional da 0029,
-- sem o vínculo com atendimento (a declaração de comparecimento não volta).
-- As tabelas são recriadas vazias.
CREATE TABLE IF NOT EXISTS document_templates (
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

CREATE UNIQUE INDEX IF NOT EXISTS document_templates_one_active_idx
  ON document_templates (clinic_id, name) WHERE active;

CREATE TABLE IF NOT EXISTS issued_documents (
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  professional_id uuid REFERENCES professionals(id)
);

CREATE INDEX IF NOT EXISTS issued_documents_patient_idx
  ON issued_documents (clinic_id, patient_id, created_at DESC);
