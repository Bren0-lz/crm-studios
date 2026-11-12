-- Contato de emergência: WhatsApp de emergência separado do telefone de emergência.
ALTER TABLE `patients`
  ADD COLUMN `emergency_contact_whatsapp` LONGTEXT NULL AFTER `emergency_contact_phone`;
