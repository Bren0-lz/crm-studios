-- Revalida o assunto do aviso na hora do envio, inclusive nas novas tentativas.
ALTER TABLE `telegram_outbox`
  ADD COLUMN `topic` VARCHAR(32) NULL;

-- Os envios antigos para grupos não têm assunto e podem vir de vínculos pessoais.
-- Sem identificar a autorização para esse conteúdo, encerra apenas os pendentes.
UPDATE `telegram_outbox`
SET `failed_at` = CURRENT_TIMESTAMP(6),
    `last_error` = 'Aviso antigo de grupo sem assunto registrado.'
WHERE `chat_id` LIKE '-%' AND `sent_at` IS NULL AND `failed_at` IS NULL;
