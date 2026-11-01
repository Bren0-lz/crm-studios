-- Campanhas manuais (WhatsApp) promocionais: a promoção vale por alguns dias a partir do dia
-- em que a mensagem foi marcada como enviada (ou até uma data final) e é usada ao agendar,
-- uma vez por cliente. Cancelar o atendimento desfaz o uso (lido pelo status dele).

-- { "validDays": inteiro } ou { "validUntil": "aaaa-mm-dd" }
ALTER TABLE `whatsapp_campaigns` ADD COLUMN `promotion` JSON;

CREATE TABLE `whatsapp_campaign_redemptions` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `campaign_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `occurrence_key` VARCHAR(200) NOT NULL,
  `appointment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `redeemed_on` DATE NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY whatsapp_campaign_redemptions_clinic_idx (`clinic_id`, `campaign_id`, `patient_id`),
  CONSTRAINT whatsapp_campaign_redemptions_occurrence_key_check CHECK (((CHAR_LENGTH(occurrence_key) >= 1) AND (CHAR_LENGTH(occurrence_key) <= 200))),
  CONSTRAINT whatsapp_campaign_redemptions_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  CONSTRAINT whatsapp_campaign_redemptions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_campaign_redemptions_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_campaign_redemptions_campaign_fkey FOREIGN KEY (clinic_id, campaign_id) REFERENCES whatsapp_campaigns(clinic_id, id)
);
