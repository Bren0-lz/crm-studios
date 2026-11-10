-- Sem vínculo nos atendimentos históricos; a contratação vincula os próximos atendimentos.
ALTER TABLE `appointments`
  ADD COLUMN `patient_plan_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD KEY `appointments_patient_plan_idx` (`clinic_id`, `patient_plan_id`),
  ADD CONSTRAINT `appointments_patient_plan_fkey`
    FOREIGN KEY (`clinic_id`, `patient_plan_id`) REFERENCES `patient_plans` (`clinic_id`, `id`);
