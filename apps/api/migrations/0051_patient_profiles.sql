ALTER TABLE patients ADD COLUMN profile jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE leads ADD COLUMN profile jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE patients ADD COLUMN inactive_at timestamptz;
ALTER TABLE patients ADD COLUMN merged_into_patient_id uuid REFERENCES patients(id);
