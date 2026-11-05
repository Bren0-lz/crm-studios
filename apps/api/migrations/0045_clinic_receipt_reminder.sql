-- Aviso "X clientes ainda não assinaram o recibo" (RC5): frequência, dia da semana, horário e
-- horas desde o envio, num objeto JSON. Vazio (NULL) = padrão dos contratos
-- (`defaultReceiptReminderSettings`, provisório até a RC6).
ALTER TABLE `clinics`
  ADD COLUMN `receipt_reminder` JSON NULL;
