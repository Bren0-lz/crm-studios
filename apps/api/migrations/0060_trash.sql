-- Lixeira: cliente, lead, atendimento e plano do cliente excluídos ficam marcados (e fora das
-- listas) até alguém restaurar ou excluir em definitivo. Enviar à lixeira não muda mais nada no
-- registro, então restaurar devolve tudo como estava.
ALTER TABLE `patients`
  ADD COLUMN `deleted_at` DATETIME(6) NULL,
  ADD COLUMN `deleted_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD KEY patients_trash_idx (`clinic_id`, `deleted_at`),
  ADD CONSTRAINT patients_trash_check CHECK (((deleted_at IS NULL) = (deleted_by_user_id IS NULL))),
  ADD CONSTRAINT patients_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES users(id);

ALTER TABLE `leads`
  ADD COLUMN `deleted_at` DATETIME(6) NULL,
  ADD COLUMN `deleted_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD KEY leads_trash_idx (`clinic_id`, `deleted_at`),
  ADD CONSTRAINT leads_trash_check CHECK (((deleted_at IS NULL) = (deleted_by_user_id IS NULL))),
  ADD CONSTRAINT leads_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES users(id);

ALTER TABLE `appointments`
  ADD COLUMN `deleted_at` DATETIME(6) NULL,
  ADD COLUMN `deleted_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD KEY appointments_trash_idx (`clinic_id`, `deleted_at`),
  ADD CONSTRAINT appointments_trash_check CHECK (((deleted_at IS NULL) = (deleted_by_user_id IS NULL))),
  ADD CONSTRAINT appointments_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES users(id);

ALTER TABLE `patient_plans`
  ADD COLUMN `deleted_at` DATETIME(6) NULL,
  ADD COLUMN `deleted_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD KEY patient_plans_trash_idx (`clinic_id`, `deleted_at`),
  ADD CONSTRAINT patient_plans_trash_check CHECK (((deleted_at IS NULL) = (deleted_by_user_id IS NULL))),
  ADD CONSTRAINT patient_plans_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES users(id);
