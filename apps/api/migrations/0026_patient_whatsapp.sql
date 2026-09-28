-- Número de WhatsApp separado do telefone de contato.
-- Em branco significa que as mensagens usam o telefone de contato.
ALTER TABLE patients
  ADD COLUMN whatsapp text;
