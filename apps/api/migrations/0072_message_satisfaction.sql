ALTER TABLE satisfaction_surveys ADD COLUMN source_message_id uuid REFERENCES outbound_messages(id);
CREATE UNIQUE INDEX satisfaction_surveys_message_idx ON satisfaction_surveys(clinic_id,source_message_id) WHERE source_message_id IS NOT NULL;
