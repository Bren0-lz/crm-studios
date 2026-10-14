CREATE TABLE external_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  kind text NOT NULL CHECK (kind IN ('fiscal','partner')),
  counterpart text NOT NULL,
  reference text NOT NULL,
  occurred_on date NOT NULL,
  patient_id uuid REFERENCES patients(id),
  patient_name text,
  receivable_id uuid REFERENCES receivables(id),
  notes text NOT NULL DEFAULT '',
  file_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/png','image/jpeg')),
  size_in_bytes integer NOT NULL CHECK (size_in_bytes BETWEEN 1 AND 5242880),
  sha256 text NOT NULL,
  content bytea NOT NULL,
  author_user_id uuid NOT NULL REFERENCES users(id),
  author_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX external_operations_reference_idx ON external_operations(clinic_id,kind,lower(counterpart),lower(reference));
CREATE INDEX external_operations_patient_idx ON external_operations(clinic_id,patient_id,occurred_on);
