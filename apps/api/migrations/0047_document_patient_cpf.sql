ALTER TABLE issued_documents
  ADD COLUMN requires_patient_cpf TINYINT(1) NULL DEFAULT NULL;
