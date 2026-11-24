-- Telegram (TG7): cada destino escolhe os assuntos que recebe (recibos, agendamentos,
-- clientes novos) e a clínica pode vincular grupos, além do chat pessoal de cada usuário.

-- Assuntos do chat pessoal. NULL = todos (como antes da TG7); `[]` = só os comandos.
ALTER TABLE `telegram_links`
  ADD COLUMN `topics` JSON NULL;

-- Código de vínculo de grupo: os assuntos escolhidos ao gerar. NULL = código do chat pessoal.
ALTER TABLE `telegram_link_codes`
  ADD COLUMN `group_topics` JSON NULL;

-- Grupos vinculados à clínica: um registro por grupo; vincular de novo troca os assuntos.
CREATE TABLE `telegram_group_links` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `chat_id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191),
  `topics` JSON NOT NULL DEFAULT ('[]'),
  `linked_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `linked_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY telegram_group_links_chat_key (`clinic_id`, `chat_id`),
  KEY telegram_group_links_chat_idx (`chat_id`),
  CONSTRAINT telegram_group_links_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  CONSTRAINT telegram_group_links_linked_by_user_id_fkey FOREIGN KEY (linked_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
