-- Recibo para assinatura (B5-02): uma linha por baixa de parcela, gerada na própria baixa.
-- O cliente assina pelo link público (token), como no contrato; envio, visualizações e
-- assinatura ficam registrados. Estornar a baixa cancela o recibo (o registro fica).
-- Tabela própria: `document_signature_links` exige um documento emitido de modelo.
CREATE TABLE `receipt_signatures` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `receivable_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `paid_at` DATETIME(6) NOT NULL,
  `amount_in_cents` INT NOT NULL,
  `token` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `sent_at` DATETIME(6),
  `view_count` INT NOT NULL DEFAULT 0,
  `first_viewed_at` DATETIME(6),
  `last_viewed_at` DATETIME(6),
  `views` JSON NOT NULL DEFAULT ('[]'),
  `signed_at` DATETIME(6),
  `signature` JSON,
  `signature_image` LONGTEXT,
  `cancelled_at` DATETIME(6),
  `cancel_reason` LONGTEXT,
  PRIMARY KEY (id),
  UNIQUE KEY receipt_signatures_token_key (token),
  KEY receipt_signatures_receivable_idx (`clinic_id`, `receivable_id`, `created_at`),
  CONSTRAINT receipt_signatures_amount_in_cents_check CHECK ((amount_in_cents >= 0)),
  CONSTRAINT receipt_signatures_check1 CHECK (((signed_at IS NULL) = (signature IS NULL))),
  CONSTRAINT receipt_signatures_check2 CHECK (((signed_at IS NULL) = (signature_image IS NULL))),
  CONSTRAINT receipt_signatures_token_check CHECK ((CHAR_LENGTH(token) >= 32)),
  CONSTRAINT receipt_signatures_view_count_check CHECK ((view_count >= 0)),
  CONSTRAINT receipt_signatures_cancellation CHECK (((cancelled_at IS NULL) = (cancel_reason IS NULL))),
  CONSTRAINT receipt_signatures_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE,
  CONSTRAINT receipt_signatures_receivable_id_fkey FOREIGN KEY (receivable_id) REFERENCES receivables(id) ON DELETE CASCADE
);
