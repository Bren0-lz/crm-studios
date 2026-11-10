-- Leads nas campanhas: destinatário da campanha manual e envio da campanha automática podem
-- ser um cliente (`patient_id`) ou um lead (`lead_id`). Quando o lead vira cliente, a linha
-- ganha também o `patient_id` (a promoção da campanha segue para o novo cliente).
ALTER TABLE `whatsapp_campaign_recipients`
  MODIFY COLUMN `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN `lead_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE KEY whatsapp_campaign_recipients_campaign_id_lead_id_key (`campaign_id`, `lead_id`),
  ADD KEY whatsapp_campaign_recipients_lead_idx (`clinic_id`, `lead_id`),
  ADD CONSTRAINT whatsapp_campaign_recipients_contact_check CHECK (((patient_id IS NOT NULL) OR (lead_id IS NOT NULL))),
  ADD CONSTRAINT whatsapp_campaign_recipients_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id);

ALTER TABLE `auto_campaign_deliveries`
  MODIFY COLUMN `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN `lead_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD KEY auto_campaign_deliveries_lead_idx (`clinic_id`, `lead_id`),
  ADD CONSTRAINT auto_campaign_deliveries_contact_check CHECK (((patient_id IS NOT NULL) OR (lead_id IS NOT NULL))),
  ADD CONSTRAINT auto_campaign_deliveries_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

-- `include_leads`: o gatilho de cliente (aniversário) também alcança leads.
-- `lead_filter`: quais leads entram ({ "stages": [...], "tags": [...], ... }); NULL = em aberto.
ALTER TABLE `auto_campaigns`
  ADD COLUMN `include_leads` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `lead_filter` JSON NULL;
