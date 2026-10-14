ALTER TABLE outbound_messages DROP CONSTRAINT outbound_messages_kind_check;
ALTER TABLE outbound_messages ADD CONSTRAINT outbound_messages_kind_check
  CHECK (kind IN ('appointment_reminder','payment_reminder','manual','birthday_reminder','satisfaction_followup'));
