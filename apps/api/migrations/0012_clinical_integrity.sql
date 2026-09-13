CREATE TABLE clinical_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  author_user_id uuid NOT NULL REFERENCES users(id),
  file_name text NOT NULL,
  mime_type text NOT NULL
    CHECK (mime_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  size_in_bytes integer NOT NULL CHECK (size_in_bytes > 0 AND size_in_bytes <= 5242880),
  content bytea NOT NULL,
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clinical_addenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  clinical_record_id uuid NOT NULL REFERENCES clinical_records(id),
  author_user_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clinical_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL
    CHECK (action IN ('read', 'export', 'upload', 'download', 'addendum')),
  entity_type text NOT NULL
    CHECK (entity_type IN ('workspace', 'attachment', 'clinical_record')),
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX clinical_attachments_patient_idx
  ON clinical_attachments (clinic_id, patient_id, created_at DESC);
CREATE INDEX clinical_addenda_patient_idx
  ON clinical_addenda (clinic_id, patient_id, created_at DESC);
CREATE INDEX clinical_access_events_patient_idx
  ON clinical_access_events (clinic_id, patient_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_clinical_integrity_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'clinical integrity records are immutable';
END;
$$;

CREATE TRIGGER clinical_attachments_immutable
BEFORE UPDATE OR DELETE ON clinical_attachments
FOR EACH ROW EXECUTE FUNCTION prevent_clinical_integrity_mutation();

CREATE TRIGGER clinical_addenda_immutable
BEFORE UPDATE OR DELETE ON clinical_addenda
FOR EACH ROW EXECUTE FUNCTION prevent_clinical_integrity_mutation();

CREATE TRIGGER clinical_access_events_immutable
BEFORE UPDATE OR DELETE ON clinical_access_events
FOR EACH ROW EXECUTE FUNCTION prevent_clinical_integrity_mutation();
