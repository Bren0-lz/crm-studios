-- Telegram (TG4): dia (fuso da clínica) do último aviso "X clientes ainda não assinaram o
-- recibo". Sem agendador, o aviso sai no primeiro comando ou webhook depois do horário
-- configurado (RC5) e no máximo uma vez por dia; NULL = nunca enviado.
ALTER TABLE `clinics`
  ADD COLUMN `telegram_receipt_reminder_sent_on` DATE NULL;
