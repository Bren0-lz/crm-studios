-- Quem usou "Calcular comissões": autor de "Comissão gerada" no Histórico (NULL nas antigas).
ALTER TABLE `commission_entries`
  ADD COLUMN `created_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  ADD CONSTRAINT commission_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id);
