-- Preferências do sino de notificações de cada usuário (grupos, faixa, avisos, som, intervalo).
-- Sem linha, valem as preferências padrão definidas nos contratos.
CREATE TABLE `user_notification_preferences` (
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `preferences` JSON NOT NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (clinic_id, user_id),
  CONSTRAINT user_notification_preferences_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE,
  CONSTRAINT user_notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
