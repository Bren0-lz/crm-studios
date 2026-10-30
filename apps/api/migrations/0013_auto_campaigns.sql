-- Campanhas automáticas: eventos já detectados pelo sistema (aniversário, plano
-- acabando, parcela vencida…) com várias mensagens, cada uma num momento. Nada é
-- disparado: a equipe envia pelo WhatsApp e registra o envio ou o motivo de não enviar.
-- `trigger` é palavra reservada no MySQL: nas consultas, sempre entre aspas.
CREATE TABLE `auto_campaigns` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` LONGTEXT NOT NULL,
  `trigger` VARCHAR(191) NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  -- [{ "id": uuid, "offset": inteiro, "message": texto }]
  `steps` JSON NOT NULL,
  `created_by` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `deleted_at` DATETIME(6),
  PRIMARY KEY (id),
  UNIQUE KEY auto_campaigns_clinic_identity (clinic_id, id),
  KEY auto_campaigns_clinic_idx (`clinic_id`, `created_at`),
  CONSTRAINT auto_campaigns_name_check CHECK (((CHAR_LENGTH(name) >= 1) AND (CHAR_LENGTH(name) <= 80))),
  CONSTRAINT auto_campaigns_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  CONSTRAINT auto_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE `auto_campaign_deliveries` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `campaign_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `step_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `occurrence_key` VARCHAR(200) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `skip_reason` LONGTEXT,
  `note` LONGTEXT,
  `message` LONGTEXT NOT NULL,
  `handled_by` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `handled_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY auto_campaign_deliveries_occurrence_key (`campaign_id`, `step_id`, `occurrence_key`),
  KEY auto_campaign_deliveries_clinic_idx (`clinic_id`, `campaign_id`),
  CONSTRAINT auto_campaign_deliveries_occurrence_key_check CHECK (((CHAR_LENGTH(occurrence_key) >= 1) AND (CHAR_LENGTH(occurrence_key) <= 200))),
  CONSTRAINT auto_campaign_deliveries_status_check CHECK ((status IN ('sent', 'skipped'))),
  CONSTRAINT auto_campaign_deliveries_note_check CHECK (((note IS NULL) OR (CHAR_LENGTH(note) <= 300))),
  CONSTRAINT auto_campaign_deliveries_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  CONSTRAINT auto_campaign_deliveries_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT auto_campaign_deliveries_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES users(id),
  CONSTRAINT auto_campaign_deliveries_campaign_fkey FOREIGN KEY (clinic_id, campaign_id) REFERENCES auto_campaigns(clinic_id, id)
);
