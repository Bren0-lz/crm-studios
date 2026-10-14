CREATE TABLE clinical_resources (
 id uuid PRIMARY KEY,
 clinic_id uuid NOT NULL REFERENCES clinics(id),
 kind text NOT NULL CHECK(kind IN ('equipment','exercise','evolution_template','evolution','training','training_execution','clinical_document')),
 patient_id uuid REFERENCES patients(id),
 name text NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','published','finalized','active','inactive')),
 family_id uuid NOT NULL,
 version integer NOT NULL DEFAULT 1,
 data jsonb NOT NULL,
 history jsonb NOT NULL DEFAULT '[]'::jsonb,
 template_snapshot jsonb,
 author_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clinical_resources_patient_idx ON clinical_resources(clinic_id,patient_id,kind);
