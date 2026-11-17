-- Quem contratou o plano e quem matriculou na turma: autor de "Plano contratado" e de
-- "Cliente matriculado em turma" no Histórico (NULL nos registros antigos).
ALTER TABLE `patient_plans`
  ADD COLUMN `created_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  ADD CONSTRAINT patient_plans_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE `group_enrollments`
  ADD COLUMN `created_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  ADD CONSTRAINT group_enrollments_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id);
