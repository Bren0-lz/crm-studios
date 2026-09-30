-- Atendimento de lead ainda não convertido (experimental/avaliação): o
-- atendimento pertence a um cliente OU a um lead, nunca aos dois.
ALTER TABLE appointments
  ALTER COLUMN patient_id DROP NOT NULL,
  ADD COLUMN lead_id uuid REFERENCES leads(id),
  ADD CONSTRAINT appointments_patient_or_lead_check
    CHECK ((patient_id IS NULL) <> (lead_id IS NULL));

CREATE INDEX appointments_lead_idx ON appointments (clinic_id, lead_id)
  WHERE lead_id IS NOT NULL;
