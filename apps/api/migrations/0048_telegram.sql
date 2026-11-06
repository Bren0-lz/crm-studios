-- Telegram (TG1): vínculo do chat de cada usuário, códigos de vínculo de uso único e fila de
-- saída das mensagens do bot. O token do bot fica fora do banco (variável de ambiente).

-- Perfis que podem vincular o chat. Vazio (NULL) = padrão dos contratos
-- (`defaultTelegramLinkRoles`, só admin, provisório até a TG6).
ALTER TABLE `clinics`
  ADD COLUMN `telegram_link_roles` JSON NULL;

-- Um chat por usuário; vincular de novo troca o chat.
CREATE TABLE `telegram_links` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `chat_id` VARCHAR(191) NOT NULL,
  `linked_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY telegram_links_user_key (`clinic_id`, `user_id`),
  KEY telegram_links_chat_idx (`chat_id`),
  CONSTRAINT telegram_links_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  CONSTRAINT telegram_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Código de vínculo (10 min, uso único): só o hash é guardado; gerar outro apaga os pendentes.
CREATE TABLE `telegram_link_codes` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `code_hash` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `expires_at` DATETIME(6) NOT NULL,
  `used_at` DATETIME(6),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY telegram_link_codes_code_hash_key (`code_hash`),
  KEY telegram_link_codes_user_idx (`clinic_id`, `user_id`),
  CONSTRAINT telegram_link_codes_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  CONSTRAINT telegram_link_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Fila de saída: até 5 tentativas com espera crescente; a falha fica registrada.
-- `clinic_id` NULL = resposta do bot a um chat ainda sem vínculo (ex.: código inválido).
CREATE TABLE `telegram_outbox` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `chat_id` VARCHAR(191) NOT NULL,
  `message` LONGTEXT NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `next_attempt_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `last_error` LONGTEXT,
  `sent_at` DATETIME(6),
  `failed_at` DATETIME(6),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY telegram_outbox_due_idx (`sent_at`, `failed_at`, `next_attempt_at`),
  KEY telegram_outbox_clinic_idx (`clinic_id`, `created_at`),
  CONSTRAINT telegram_outbox_attempts_check CHECK (((attempts >= 0) AND (attempts <= 5))),
  CONSTRAINT telegram_outbox_message_check CHECK ((CHAR_LENGTH(message) BETWEEN 1 AND 4096)),
  CONSTRAINT telegram_outbox_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);
