-- Comprovantes de pagamento/recebimento: vários arquivos por baixa de parcela, despesa paga
-- ou baixa conciliada de comissão. O vínculo é polimórfico; a existência é validada na API.
-- Estorno da baixa: os comprovantes ficam no histórico, marcados como da baixa estornada.
-- Comprovante enviado por engano: sai da lista, mas o registro fica para auditoria.
CREATE TABLE `payment_proofs` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `entity_type` VARCHAR(191) NOT NULL,
  `entity_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `file_name` LONGTEXT NOT NULL,
  `mime_type` VARCHAR(191) NOT NULL,
  `size_in_bytes` INT NOT NULL,
  `sha256` LONGTEXT NOT NULL,
  `content` LONGBLOB NOT NULL,
  `author_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `author_name` LONGTEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `reversed_at` DATETIME(6),
  `deleted_at` DATETIME(6),
  `deleted_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `deletion_reason` LONGTEXT,
  PRIMARY KEY (id),
  KEY payment_proofs_entity_idx (`clinic_id`, `entity_type`, `entity_id`, `created_at`),
  CONSTRAINT payment_proofs_entity_type_check CHECK ((entity_type IN ('receivable', 'payable', 'commission_account_payment'))),
  CONSTRAINT payment_proofs_mime_type_check CHECK ((mime_type IN ('application/pdf', 'image/png', 'image/jpeg'))),
  CONSTRAINT payment_proofs_size_in_bytes_check CHECK (((size_in_bytes >= 1) AND (size_in_bytes <= 5242880))),
  CONSTRAINT payment_proofs_deletion_reason_check CHECK (((deletion_reason IS NULL) OR ((CHAR_LENGTH(deletion_reason) >= 5) AND (CHAR_LENGTH(deletion_reason) <= 500)))),
  CONSTRAINT payment_proofs_deletion CHECK (((deleted_at IS NULL) = (deleted_by_user_id IS NULL))),
  CONSTRAINT payment_proofs_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  CONSTRAINT payment_proofs_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id),
  CONSTRAINT payment_proofs_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES users(id)
);
