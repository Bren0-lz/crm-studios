-- Modelo da mensagem de cobrança Pix enviada no cadastro do cliente (vazio = texto padrão).
ALTER TABLE clinics ADD COLUMN pix_message_template text;
