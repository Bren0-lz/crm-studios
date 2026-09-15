ALTER TABLE patients DROP CONSTRAINT patients_clinic_id_cpf_key;

ALTER TABLE patients
  ADD CONSTRAINT patients_clinic_id_cpf_key UNIQUE (clinic_id, cpf);
