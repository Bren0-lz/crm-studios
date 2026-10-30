-- Campanhas automáticas promocionais: a promoção vale por alguns dias a partir da data
-- programada da primeira mensagem e é usada ao agendar. Quem usa pode ficar fora da
-- campanha por um tempo. Cancelar o atendimento desfaz o uso (lido pelo status dele).

-- { "validDays": inteiro, "cooldown": { "amount": inteiro, "unit": "days"|"weeks"|"months" } }
ALTER TABLE `auto_campaigns` ADD COLUMN `promotion` JSON;

-- Último dia em que a promoção vale para o cliente que recebeu a mensagem.
ALTER TABLE `auto_campaign_deliveries` ADD COLUMN `promotion_valid_until` DATE;

CREATE TABLE `auto_campaign_redemptions` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `campaign_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `occurrence_key` VARCHAR(200) NOT NULL,
  `appointment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `redeemed_on` DATE NOT NULL,
  `blocked_until` DATE,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY auto_campaign_redemptions_clinic_idx (`clinic_id`, `campaign_id`, `patient_id`),
  CONSTRAINT auto_campaign_redemptions_occurrence_key_check CHECK (((CHAR_LENGTH(occurrence_key) >= 1) AND (CHAR_LENGTH(occurrence_key) <= 200))),
  CONSTRAINT auto_campaign_redemptions_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  CONSTRAINT auto_campaign_redemptions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT auto_campaign_redemptions_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT auto_campaign_redemptions_campaign_fkey FOREIGN KEY (clinic_id, campaign_id) REFERENCES auto_campaigns(clinic_id, id)
);
