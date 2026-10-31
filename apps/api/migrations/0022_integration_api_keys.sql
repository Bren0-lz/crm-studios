-- Chaves da API externa (`/external/v1`, dashboard de vendas). Só o hash SHA-256 do token fica
-- guardado; o token aparece uma única vez na criação. A chave age em nome do admin que a criou
-- (permissões e histórico dele) e para de valer quando revogada ou quando ele é desativado.
CREATE TABLE `integration_api_keys` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `prefix` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `token_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `scopes` JSON NOT NULL DEFAULT ('[]'),
  `created_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `last_used_at` DATETIME(6),
  `revoked_at` DATETIME(6),
  PRIMARY KEY (id),
  UNIQUE KEY integration_api_keys_token_hash_key (`token_hash`),
  KEY integration_api_keys_clinic_idx (`clinic_id`, `created_at`),
  CONSTRAINT integration_api_keys_name_check CHECK ((CHAR_LENGTH(name) BETWEEN 3 AND 80)),
  CONSTRAINT integration_api_keys_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE,
  CONSTRAINT integration_api_keys_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);
