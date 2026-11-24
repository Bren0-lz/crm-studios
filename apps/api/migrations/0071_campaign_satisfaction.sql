ALTER TABLE satisfaction_surveys
  ADD COLUMN campaign_recipient_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE KEY satisfaction_surveys_campaign_recipient_idx (clinic_id, campaign_recipient_id),
  ADD CONSTRAINT satisfaction_surveys_campaign_recipient_fk
    FOREIGN KEY (campaign_recipient_id) REFERENCES whatsapp_campaign_recipients(id) ON DELETE SET NULL;
