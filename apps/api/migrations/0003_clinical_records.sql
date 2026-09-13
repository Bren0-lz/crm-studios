CREATE TYPE clinical_record_status AS ENUM ('draft', 'finalized');

CREATE TABLE clinical_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  professional_id uuid NOT NULL REFERENCES professionals(id),
  author_user_id uuid NOT NULL REFERENCES users(id),
  status clinical_record_status NOT NULL DEFAULT 'draft',
  subjective text NOT NULL DEFAULT '',
  objective text NOT NULL DEFAULT '',
  assessment text NOT NULL DEFAULT '',
  plan text NOT NULL DEFAULT '',
  pain_scale smallint CHECK (pain_scale BETWEEN 0 AND 10),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, appointment_id)
);

CREATE INDEX clinical_records_patient_idx
  ON clinical_records (clinic_id, patient_id, appointment_id);

CREATE TABLE clinical_record_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  clinical_record_id uuid NOT NULL REFERENCES clinical_records(id),
  author_user_id uuid NOT NULL REFERENCES users(id),
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinical_record_id, version)
);

CREATE INDEX clinical_record_revisions_record_idx
  ON clinical_record_revisions (clinic_id, clinical_record_id, version DESC);

CREATE FUNCTION prevent_finalized_clinical_record_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'Finalized clinical records are immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clinical_records_immutable_after_finalize
BEFORE UPDATE OR DELETE ON clinical_records
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_clinical_record_change();
