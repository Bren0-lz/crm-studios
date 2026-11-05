-- Modelo da mensagem "recebemos seu pagamento" (RC3), enviada pelo WhatsApp com o link de
-- assinatura do recibo. Vazio (NULL) = texto padrão (`defaultPaymentReceiptMessageTemplate`).
ALTER TABLE `clinics`
  ADD COLUMN `payment_receipt_message_template` LONGTEXT NULL;
