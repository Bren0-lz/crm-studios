ALTER TABLE patient_tabs ADD CONSTRAINT patient_tabs_clinic_identity UNIQUE (clinic_id, id);
ALTER TABLE appointments ADD CONSTRAINT appointments_clinic_identity UNIQUE (clinic_id, id);
ALTER TABLE patient_plans ADD COLUMN source_tab_id uuid;
ALTER TABLE patient_plans ADD COLUMN source_appointment_id uuid;
ALTER TABLE patient_plans ADD CONSTRAINT patient_plans_tab_source
  FOREIGN KEY (clinic_id, source_tab_id) REFERENCES patient_tabs(clinic_id, id);
ALTER TABLE patient_plans ADD CONSTRAINT patient_plans_appointment_source
  FOREIGN KEY (clinic_id, source_appointment_id) REFERENCES appointments(clinic_id, id);
ALTER TABLE patient_plans ADD CONSTRAINT patient_plans_tab_source_pair
  CHECK ((source_tab_id IS NULL) = (source_appointment_id IS NULL));
CREATE UNIQUE INDEX patient_plans_tab_appointment_idx
  ON patient_plans(clinic_id, source_appointment_id) WHERE source_tab_id IS NOT NULL;
